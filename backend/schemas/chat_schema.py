from typing import List, Optional
from pydantic import BaseModel, Field

# =======================================================================
# Pydantic Validation Schemas for Context-Aware Chat
# =======================================================================

class ChatRequest(BaseModel):
    """
    Payload received from the frontend when a user sends a message.
    Upgraded for Phase 2: Includes support for dynamic Multi-LLM routing.
    """
    message: str = Field(
        ..., 
        min_length=1, 
        description="The message/query from the user"
    )
    conversation_id: str = Field(
        default="default", 
        description="Session ID to maintain chat memory context"
    )
    # Enterprise Multi-LLM Routing parameter
    selected_model: Optional[str] = Field(
        default=None, 
        description="The specific LLM requested by the user (e.g., 'gemini-2.5-flash', 'claude-3-5-sonnet-latest', 'gpt-4o-mini'). If None, the system routes to the default configured chat model."
    )

class ChatResponse(BaseModel):
    """
    Standardized response returned to the frontend.
    Upgraded for Phase 2: Includes the exact model used so the UI can display the correct badge.
    """
    reply: str = Field(
        ..., 
        description="The AI agent's contextual response"
    )
    sources_used: List[str] = Field(
        default=[], 
        description="URLs, DB Tables, or references extracted from RAG tools"
    )
    # Transparency metric for the frontend UI
    used_model: str = Field(
        ..., 
        description="The exact LLM name that generated this response (for frontend UI badging, e.g., 'Gemini 2.5 Flash')"
    )