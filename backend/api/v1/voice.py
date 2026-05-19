import json
import logging
import asyncio
import websockets
from fastapi import APIRouter, WebSocket, WebSocketDisconnect, Query
from jose import jwt, JWTError

from core.config import settings
from db.session import get_db

# Configure enterprise logging for Voice AI tracking
logger = logging.getLogger(__name__)

router = APIRouter(prefix="/voice", tags=["Realtime Voice Agent"])

async def verify_ws_token(token: str) -> str:
    """
    Validates the JWT token for WebSocket connections since standard headers 
    cannot be easily passed via browser native WebSocket APIs.
    """
    try:
        payload = jwt.decode(token, settings.SECRET_KEY, algorithms=[settings.ALGORITHM])
        user_id: str = payload.get("sub")
        if user_id is None:
            raise ValueError("Invalid token payload")
        return user_id
    except JWTError:
        raise ValueError("Token validation failed")

@router.websocket("/stream")
async def voice_websocket_endpoint(
    websocket: WebSocket, 
    token: str = Query(..., description="JWT access token passed as query parameter")
):
    """
    Enterprise WebSocket Proxy for ultra-low latency Voice AI.
    Connects the Next.js frontend audio stream directly to the OpenAI Realtime API.
    Handles bi-directional full-duplex audio transmission.
    """
    # 1. Authenticate the WebSocket Connection
    try:
        user_id = await verify_ws_token(token)
        await websocket.accept()
        logger.info(f"Voice Agent WebSocket connected for User ID: {user_id}")
    except Exception as e:
        logger.warning(f"Unauthorized WebSocket connection attempt: {str(e)}")
        await websocket.close(code=1008) # Policy Violation
        return

    # OpenAI Realtime API configuration
    OPENAI_WS_URL = "wss://api.openai.com/v1/realtime?model=gpt-4o-realtime-preview-2024-12-17"
    headers = {
        "Authorization": f"Bearer {settings.OPENAI_API_KEY}",
        "OpenAI-Beta": "realtime=v1"
    }

    try:
        # 2. Establish connection to the OpenAI Realtime Engine
        async with websockets.connect(OPENAI_WS_URL, additional_headers=headers) as openai_ws:
            logger.info("Successfully connected to OpenAI Realtime Engine.")

            # Initial configuration event to setup voice and response modalities
            session_update = {
                "type": "session.update",
                "session": {
                    "modalities": ["audio", "text"],
                    "instructions": "You are a highly capable and friendly technical curriculum tutor. Keep your answers concise, encouraging, and clear. You are talking directly to a student via voice.",
                    "voice": "alloy", # Professional yet friendly voice
                    "input_audio_format": "pcm16",
                    "output_audio_format": "pcm16"
                }
            }
            await openai_ws.send(json.dumps(session_update))

            # 3. Define Bi-directional Piping Tasks
            async def forward_frontend_to_openai():
                """Reads JSON/Audio chunks from Next.js and forwards to OpenAI"""
                try:
                    while True:
                        client_message = await websocket.receive_text()
                        # Pass the message directly to OpenAI
                        await openai_ws.send(client_message)
                except WebSocketDisconnect:
                    logger.info("Frontend client disconnected the voice session.")
                except Exception as e:
                    logger.error(f"Error forwarding to OpenAI: {str(e)}")

            async def forward_openai_to_frontend():
                """Reads real-time audio/text events from OpenAI and sends to Next.js"""
                try:
                    while True:
                        openai_message = await openai_ws.recv()
                        await websocket.send_text(openai_message)
                except websockets.exceptions.ConnectionClosed:
                    logger.info("OpenAI closed the Realtime connection.")
                except Exception as e:
                    logger.error(f"Error forwarding to frontend: {str(e)}")

            # Execute both streams concurrently
            await asyncio.gather(
                forward_frontend_to_openai(),
                forward_openai_to_frontend()
            )

    except Exception as e:
        logger.error(f"Critical failure in Voice AI websocket stream: {str(e)}")
    finally:
        # Graceful cleanup
        if websocket.client_state.name != "DISCONNECTED":
            await websocket.close()
        logger.info(f"Voice session terminated for User ID: {user_id}")