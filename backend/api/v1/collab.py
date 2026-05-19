import logging
from typing import Dict, List
from fastapi import APIRouter, WebSocket, WebSocketDisconnect

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/collab", tags=["Multiplayer Code Collaboration"])

class ConnectionManager:
    """
    Enterprise WebSocket Room Manager.
    Handles grouping connections by sessionId to ensure CRDT (Conflict-Free Replicated Data Types)
    binary packets from Yjs are strictly broadcasted to the correct room.
    """
    def __init__(self):
        # Maps session_id (str) to a list of active WebSockets
        self.active_rooms: Dict[str, List[WebSocket]] = {}

    async def connect(self, websocket: WebSocket, session_id: str):
        await websocket.accept()
        if session_id not in self.active_rooms:
            self.active_rooms[session_id] = []
        self.active_rooms[session_id].append(websocket)
        logger.info(f"Client joined Collab Session: {session_id}. Total active in room: {len(self.active_rooms[session_id])}")

    def disconnect(self, websocket: WebSocket, session_id: str):
        if session_id in self.active_rooms:
            self.active_rooms[session_id].remove(websocket)
            if len(self.active_rooms[session_id]) == 0:
                del self.active_rooms[session_id]
                logger.info(f"Collab Session {session_id} is now empty and has been garbage collected.")

    async def broadcast(self, message: bytes, sender: WebSocket, session_id: str):
        """
        Broadcasts raw binary Yjs update packets to all other clients in the same session.
        """
        if session_id in self.active_rooms:
            for connection in self.active_rooms[session_id]:
                if connection != sender:
                    try:
                        # Yjs y-websocket strictly relies on binary transmission
                        await connection.send_bytes(message)
                    except Exception as e:
                        logger.error(f"Failed to transmit binary state to a client: {str(e)}")

# Instantiate the singleton room manager
manager = ConnectionManager()

@router.websocket("/{session_id}")
async def collaboration_endpoint(websocket: WebSocket, session_id: str):
    """
    The main signaling endpoint targeted by the frontend's Yjs WebsocketProvider.
    """
    await manager.connect(websocket, session_id)
    try:
        while True:
            # Receive binary state update from one client's Monaco Editor
            data = await websocket.receive_bytes()
            # Push the binary state to everyone else in the session
            await manager.broadcast(data, websocket, session_id)
            
    except WebSocketDisconnect:
        manager.disconnect(websocket, session_id)
    except Exception as e:
        logger.error(f"Unexpected error in collab socket for session {session_id}: {str(e)}")
        manager.disconnect(websocket, session_id)