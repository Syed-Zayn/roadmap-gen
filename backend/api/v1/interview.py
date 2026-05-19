import json
import logging
import asyncio
import websockets
from fastapi import APIRouter, WebSocket, WebSocketDisconnect, Query, Depends
from jose import jwt, JWTError

from core.config import settings
from db.session import AsyncSessionLocal
from agents.interview_agent import interview_agent

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/interview", tags=["AI Mock Interviewer"])

async def verify_ws_token(token: str) -> str:
    """
    Decodes the JWT token natively since standard FastAPI Depends() 
    cannot be reliably passed through browser WebSocket handshake headers.
    """
    try:
        payload = jwt.decode(token, settings.SECRET_KEY, algorithms=[settings.ALGORITHM])
        user_id: str = payload.get("sub")
        if user_id is None:
            raise ValueError("Token missing subject payload")
        return user_id
    except JWTError:
        raise ValueError("Cryptographic token validation failed")

@router.websocket("/stream")
async def mock_interview_websocket(
    websocket: WebSocket, 
    token: str = Query(..., description="Secure JWT access token")
):
    """
    Enterprise WebSocket Proxy establishing a full-duplex connection 
    between the student's browser and the OpenAI Realtime Audio Engine.
    """
    try:
        student_id = await verify_ws_token(token)
        await websocket.accept()
        logger.info(f"Mock Interview session initiated for student ID: {student_id}")
    except Exception as e:
        logger.warning(f"Unauthorized interview socket connection: {str(e)}")
        await websocket.close(code=1008) 
        return

    # Fetch dynamic context from the database using a fresh isolated session
    async with AsyncSessionLocal() as db:
        system_instructions = await interview_agent.build_interview_context(student_id, db)

    OPENAI_WS_URL = "wss://api.openai.com/v1/realtime?model=gpt-4o-realtime-preview-2024-12-17"
    headers = {
        "Authorization": f"Bearer {settings.OPENAI_API_KEY}",
        "OpenAI-Beta": "realtime=v1"
    }

    try:
        # Establish upstream connection to OpenAI
        async with websockets.connect(OPENAI_WS_URL, additional_headers=headers) as openai_ws:
            logger.info("Upstream OpenAI Realtime Engine connected.")

            # Configure the AI's modality, voice, and inject the stateful pedagogical context
            session_config = {
                "type": "session.update",
                "session": {
                    "modalities": ["audio", "text"],
                    "instructions": system_instructions,
                    "voice": "shimmer", # Professional, clear voice suitable for an interviewer
                    "input_audio_format": "pcm16",
                    "output_audio_format": "pcm16"
                }
            }
            await openai_ws.send(json.dumps(session_config))

            # Concurrency Piping: Client -> OpenAI
            async def stream_client_to_ai():
                try:
                    while True:
                        payload = await websocket.receive_text()
                        await openai_ws.send(payload)
                except WebSocketDisconnect:
                    logger.info("Student dropped the interview connection.")
                except Exception as e:
                    logger.error(f"Client to AI stream error: {str(e)}")

            # Concurrency Piping: OpenAI -> Client
            async def stream_ai_to_client():
                try:
                    while True:
                        response = await openai_ws.recv()
                        
                        # Peek into the payload to track AI speech state for the frontend UI
                        data = json.loads(response)
                        if data.get("type") == "response.audio.delta":
                            await websocket.send_text(json.dumps({"type": "agent_speaking"}))
                        elif data.get("type") == "response.audio.done":
                            await websocket.send_text(json.dumps({"type": "agent_idle"}))
                            
                        # Forward the actual audio bytes payload back to the browser
                        await websocket.send_text(response)
                except websockets.exceptions.ConnectionClosed:
                    logger.info("OpenAI cleanly closed the upstream socket.")
                except Exception as e:
                    logger.error(f"AI to Client stream error: {str(e)}")

            # Block and run both duplex streams concurrently
            await asyncio.gather(
                stream_client_to_ai(),
                stream_ai_to_client()
            )

    except Exception as e:
        logger.error(f"Critical failure in Mock Interview router: {str(e)}")
    finally:
        if websocket.client_state.name != "DISCONNECTED":
            await websocket.close()
        logger.info(f"Interview session terminated for {student_id}")