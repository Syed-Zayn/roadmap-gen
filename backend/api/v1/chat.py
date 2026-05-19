import logging
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from db.session import get_db
from models.user import User
from api.v1.auth import get_current_user

# Enterprise Fix: Import schemas from the dedicated schemas directory
from schemas.chat_schema import ChatRequest, ChatResponse

# 🚨 THE FIX: Correctly importing from agents.chat_agent as per your uploaded file
from agents.chat_agent import process_chat_message

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/chat", tags=["Context-Aware AI Agent"])

# =======================================================================
# API Endpoints
# =======================================================================
@router.post("/message", response_model=ChatResponse)
async def send_chat_message(
    payload: ChatRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Unified AI Chat Agent endpoint for both Students and Teachers.
    [Phase 2 Upgrade]: Dynamically routes the request to the user's preferred LLM
    (Gemini, Claude, or OpenAI) via the 'selected_model' parameter.
    """
    logger.info(f"Chat request received from User {current_user.id} (Role: {current_user.role.value}, Model: {payload.selected_model or 'Default'})")

    try:
        # Offload the LLM execution to the dedicated Context-Aware LangChain Agent.
        # It returns the response text, the extracted sources, and the exact model used.
        # 🚨 THE FIX: Calling process_chat_message directly (not from a class instance)
        agent_reply, sources, used_model = await process_chat_message(
            query=payload.message,
            user_id=str(current_user.id),
            user_role=current_user.role.value,
            session_id=payload.conversation_id,
            db=db,
            selected_model=payload.selected_model
        )

        return ChatResponse(
            reply=agent_reply,
            sources_used=sources,
            used_model=used_model
        )

    except Exception as e:
        logger.error(f"AI Chat Agent encountered a critical error: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="The AI Context Agent is currently processing too much data. Please try again later."
        )