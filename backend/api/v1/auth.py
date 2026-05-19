import logging
import json
from typing import Any, Dict
from fastapi import APIRouter, Depends, HTTPException, status, Request
from fastapi.security import OAuth2PasswordRequestForm, OAuth2PasswordBearer
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from jose import jwt, JWTError

# Enterprise WebAuthn dependencies
from webauthn import (
    generate_registration_options,
    verify_registration_response,
    generate_authentication_options,
    verify_authentication_response,
    options_to_json
)
# ENTERPRISE FIX: Updated imports to use WebAuthn v2.0+ JSON parsers and strict structs
from webauthn.helpers import (
    parse_registration_credential_json, 
    parse_authentication_credential_json,
    bytes_to_base64url, 
    base64url_to_bytes
)
# ENTERPRISE FIX: Imported PublicKeyCredentialType Enum to solve strict string typing issue
from webauthn.helpers.structs import PublicKeyCredentialDescriptor, PublicKeyCredentialType

from db.session import get_db
from core.config import settings
from core.security import get_password_hash, verify_password, create_access_token
from models.user import User, WebAuthnCredential
from schemas.user_schema import UserCreate, UserResponse

# Optional: Using redis for secure, distributed WebAuthn challenge caching
import redis.asyncio as aioredis

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/auth", tags=["Authentication"])

oauth2_scheme = OAuth2PasswordBearer(tokenUrl=f"{settings.API_V1_STR}/auth/login")

# Redis connection for Auth Challenges (Short-lived state)
# Falls back to memory warning if Redis is not configured, maintaining deployment integrity
async def get_redis_client():
    try:
        client = await aioredis.from_url(settings.REDIS_URL, decode_responses=True)
        yield client
    finally:
        await client.aclose()

async def get_current_user(
    token: str = Depends(oauth2_scheme), 
    db: AsyncSession = Depends(get_db)
) -> User:
    """
    Dependency to validate the JWT token and retrieve the current active user.
    """
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )
    
    try:
        payload = jwt.decode(token, settings.SECRET_KEY, algorithms=[settings.ALGORITHM])
        user_id: str = payload.get("sub")
        if user_id is None:
            raise credentials_exception
    except JWTError as e:
        logger.warning(f"JWT validation failed: {str(e)}")
        raise credentials_exception

    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    
    if user is None:
        logger.warning(f"Authenticated user ID {user_id} no longer exists in the database.")
        raise credentials_exception
        
    return user

@router.post("/register", response_model=UserResponse, status_code=status.HTTP_201_CREATED)
async def register_user(user_in: UserCreate, db: AsyncSession = Depends(get_db)):
    """ Registers a new user with standard password hashing. """
    result = await db.execute(select(User).where(User.email == user_in.email))
    if result.scalar_one_or_none():
        raise HTTPException(status_code=400, detail="A user with this email already exists.")

    new_user = User(
        email=user_in.email,
        hashed_password=get_password_hash(user_in.password),
        role=user_in.role
    )
    db.add(new_user)
    await db.commit()
    await db.refresh(new_user)
    return new_user

@router.post("/login")
async def login_access_token(
    db: AsyncSession = Depends(get_db), 
    form_data: OAuth2PasswordRequestForm = Depends()
):
    """ Authenticates user via email/password and returns JWT. """
    result = await db.execute(select(User).where(User.email == form_data.username))
    user = result.scalar_one_or_none()

    if not user or not verify_password(form_data.password, user.hashed_password):
        raise HTTPException(status_code=401, detail="Incorrect email or password")

    access_token = create_access_token(subject=str(user.id))
    
    # ENTERPRISE FIX: Normalize role string to explicitly match frontend routing expectations
    # Converts DB 'SUPERADMIN' to 'SuperAdmin' so Next.js middleware doesn't block the dashboard
    normalized_role = "SuperAdmin" if user.role.value == "SUPERADMIN" else user.role.value

    return {"access_token": access_token, "token_type": "bearer", "role": normalized_role}

# ---------------------------------------------------------
# WEBAUTHN / PASSKEY FLOWS (FACE ID / TOUCH ID)
# ---------------------------------------------------------

@router.post("/webauthn/register/options")
async def generate_webauthn_registration_options(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
    redis: aioredis.Redis = Depends(get_redis_client)
):
    """ Step 1: Generates a cryptographic challenge for registering a new FaceID/Device. """
    # Exclude existing credentials so the user doesn't register the same device twice
    result = await db.execute(select(WebAuthnCredential.credential_id).where(WebAuthnCredential.user_id == current_user.id))
    existing_creds = [cred for cred in result.scalars().all()]

    options = generate_registration_options(
        rp_id=settings.DOMAIN,
        rp_name=settings.PROJECT_NAME,
        user_id=str(current_user.id).encode("utf-8"),
        user_name=current_user.email,
        # ENTERPRISE FIX: Use explicit Enum type instead of string for WebAuthn v2.0+
        exclude_credentials=[
            PublicKeyCredentialDescriptor(id=cred_id, type=PublicKeyCredentialType.PUBLIC_KEY) for cred_id in existing_creds
        ]
    )

    # Store challenge securely in Redis with a 5-minute TTL
    await redis.setex(f"webauthn_reg_{current_user.id}", 300, options.challenge.hex())

    return json.loads(options_to_json(options))

@router.post("/webauthn/register/verify")
async def verify_webauthn_registration(
    request: Request,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
    redis: aioredis.Redis = Depends(get_redis_client)
):
    """ Step 2: Verifies the hardware assertion and saves the Public Key to DB. """
    payload = await request.json()
    
    # Retrieve challenge from Redis
    expected_challenge_hex = await redis.get(f"webauthn_reg_{current_user.id}")
    if not expected_challenge_hex:
        raise HTTPException(status_code=400, detail="Registration session expired or invalid.")

    try:
        # ENTERPRISE FIX: Used the updated WebAuthn v2.0 parser
        credential = parse_registration_credential_json(payload)
        verification = verify_registration_response(
            credential=credential,
            expected_challenge=bytes.fromhex(expected_challenge_hex),
            expected_rp_id=settings.DOMAIN,
            expected_origin=settings.FRONTEND_URL,
        )
    except Exception as e:
        logger.error(f"WebAuthn Verification Failed: {str(e)}")
        raise HTTPException(status_code=400, detail="Hardware verification failed.")

    # Save the new verified hardware key
    new_credential = WebAuthnCredential(
        user_id=current_user.id,
        credential_id=verification.credential_id,
        public_key=verification.credential_public_key,
        sign_count=verification.sign_count
    )
    db.add(new_credential)
    await db.commit()
    
    # Clear the challenge from cache
    await redis.delete(f"webauthn_reg_{current_user.id}")
    
    return {"status": "success", "message": "Biometric login registered successfully."}

@router.post("/webauthn/login/options")
async def generate_webauthn_login_options(
    email: str,
    db: AsyncSession = Depends(get_db),
    redis: aioredis.Redis = Depends(get_redis_client)
):
    """ Step 1 of Login: Generates a challenge for the client to sign with FaceID. """
    result = await db.execute(select(User).where(User.email == email))
    user = result.scalar_one_or_none()
    
    if not user:
        raise HTTPException(status_code=404, detail="User not found.")

    # Fetch registered devices for this user
    cred_result = await db.execute(select(WebAuthnCredential).where(WebAuthnCredential.user_id == user.id))
    credentials = cred_result.scalars().all()
    
    if not credentials:
        raise HTTPException(status_code=400, detail="No passkeys registered for this account.")

    options = generate_authentication_options(
        rp_id=settings.DOMAIN,
        # ENTERPRISE FIX: Use explicit Enum type instead of string for WebAuthn v2.0+
        allow_credentials=[
            PublicKeyCredentialDescriptor(id=cred.credential_id, type=PublicKeyCredentialType.PUBLIC_KEY) for cred in credentials
        ]
    )

    await redis.setex(f"webauthn_auth_{user.id}", 300, options.challenge.hex())
    return json.loads(options_to_json(options))

@router.post("/webauthn/login/verify")
async def verify_webauthn_login(
    email: str,
    request: Request,
    db: AsyncSession = Depends(get_db),
    redis: aioredis.Redis = Depends(get_redis_client)
):
    """ Step 2 of Login: Verifies cryptographic signature and issues JWT. """
    payload = await request.json()
    
    # Locate User and expected challenge
    user_result = await db.execute(select(User).where(User.email == email))
    user = user_result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=404, detail="User not found.")

    expected_challenge_hex = await redis.get(f"webauthn_auth_{user.id}")
    if not expected_challenge_hex:
        raise HTTPException(status_code=400, detail="Login session expired.")

    # ENTERPRISE FIX: Used the updated WebAuthn v2.0 parser
    credential = parse_authentication_credential_json(payload)
    cred_result = await db.execute(
        select(WebAuthnCredential).where(WebAuthnCredential.credential_id == base64url_to_bytes(credential.id))
    )
    db_credential = cred_result.scalar_one_or_none()
    
    if not db_credential:
        raise HTTPException(status_code=401, detail="Unrecognized hardware key.")

    try:
        verification = verify_authentication_response(
            credential=credential,
            expected_challenge=bytes.fromhex(expected_challenge_hex),
            expected_rp_id=settings.DOMAIN,
            expected_origin=settings.FRONTEND_URL,
            credential_public_key=db_credential.public_key,
            credential_current_sign_count=db_credential.sign_count,
        )
    except Exception as e:
        logger.error(f"Passkey Authentication Failed: {str(e)}")
        raise HTTPException(status_code=401, detail="Passkey verification failed.")

    # Update sign count to prevent replay attacks
    db_credential.sign_count = verification.new_sign_count
    await db.commit()
    await redis.delete(f"webauthn_auth_{user.id}")

    # Issue standard JWT token on successful biometric validation
    access_token = create_access_token(subject=str(user.id))
    
    # ENTERPRISE FIX: Role Normalization for WebAuthn Login as well
    normalized_role = "SuperAdmin" if user.role.value == "SUPERADMIN" else user.role.value

    return {"access_token": access_token, "token_type": "bearer", "role": normalized_role}