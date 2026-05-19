from datetime import datetime, timedelta, timezone
from typing import Any, Union
import bcrypt
from jose import jwt
from core.config import settings

def verify_password(plain_password: str, hashed_password: str) -> bool:
    """
    Compares a plain text password against its securely hashed version.
    Replaced passlib with native bcrypt for Enterprise stability.
    """
    # Native bcrypt requires bytes to perform the check
    return bcrypt.checkpw(
        plain_password.encode('utf-8'), 
        hashed_password.encode('utf-8')
    )

def get_password_hash(password: str) -> str:
    """
    Generates a bcrypt hash for a new user password prior to database storage.
    """
    # Encode password to bytes, generate a secure salt, and hash
    pwd_bytes = password.encode('utf-8')
    salt = bcrypt.gensalt()
    hashed_password = bcrypt.hashpw(pwd_bytes, salt)
    
    # Decode back to string so it can be stored in the PostgreSQL String column
    return hashed_password.decode('utf-8')

def create_access_token(subject: Union[str, Any], expires_delta: timedelta = None) -> str:
    """
    Generates a secure JSON Web Token (JWT) for user sessions.
    The 'sub' claim typically holds the user's unique identifier (e.g., UUID or email).
    """
    # Use UTC for standard expiration timeline across distributed servers
    if expires_delta:
        expire = datetime.now(timezone.utc) + expires_delta
    else:
        expire = datetime.now(timezone.utc) + timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)
    
    to_encode = {"exp": expire, "sub": str(subject)}
    
    encoded_jwt = jwt.encode(
        to_encode, settings.SECRET_KEY, algorithm=settings.ALGORITHM
    )
    return encoded_jwt