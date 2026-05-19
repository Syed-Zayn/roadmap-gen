import logging
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
from langchain_openai import ChatOpenAI
from langchain_core.messages import HumanMessage, SystemMessage

from core.config import settings
from models.user import User, UserRole
from api.v1.auth import get_current_user

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/vision", tags=["Smart Whiteboard Vision API"])

# =======================================================================
# Pydantic Schemas for Strict Input/Output Validation
# =======================================================================
class VisionGenerationRequest(BaseModel):
    image: str = Field(..., description="Base64 encoded string of the wireframe image")
    context: str = Field(
        default="Generate a responsive React/Tailwind component based on this wireframe drawing.",
        description="Specific instructions for the LLM regarding the image"
    )

class VisionGenerationResponse(BaseModel):
    code: str = Field(..., description="The generated React/Tailwind source code")

# =======================================================================
# Endpoints
# =======================================================================
@router.post("/generate", response_model=VisionGenerationResponse)
async def generate_code_from_wireframe(
    request: VisionGenerationRequest,
    current_user: User = Depends(get_current_user)
):
    """
    Analyzes a base64 wireframe image using GPT-4o's native vision capabilities 
    and returns production-ready UI code.
    Restricted to Teachers and SuperAdmins.
    """
    # Enforce RBAC (Role-Based Access Control)
    if current_user.role not in [UserRole.TEACHER, UserRole.SUPERADMIN]:
        logger.warning(f"Unauthorized vision API access attempt by User ID: {current_user.id}")
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Access Denied: Only instructors can use the Smart Whiteboard code generation."
        )

    logger.info(f"Processing Vision Code Generation request for User ID: {current_user.id}")

    try:
        # Initialize the multimodal model. GPT-4o handles both text and vision seamlessly.
        llm = ChatOpenAI(
            api_key=settings.OPENAI_API_KEY,
            model="gpt-4o",  # Standard gpt-4o has vision enabled by default
            temperature=0.1, # Low temperature to ensure structured, syntax-correct code
            max_retries=2
        )

        # Construct the multimodal prompt structure required by LangChain
        messages = [
            SystemMessage(
                content="You are an elite Frontend Engineer. Your task is to look at wireframes "
                        "and output ONLY valid, production-ready React JSX code using Tailwind CSS. "
                        "Do not include markdown backticks (```) or explanatory text in your response. "
                        "Just return the raw code."
            ),
            HumanMessage(
                content=[
                    {"type": "text", "text": request.context},
                    {
                        "type": "image_url",
                        "image_url": {"url": request.image}
                    }
                ]
            )
        ]

        # Execute the multimodal request
        response = await llm.ainvoke(messages)
        
        # Clean up any potential markdown formatting the LLM might have slipped in
        clean_code = response.content.replace("```jsx", "").replace("```tsx", "").replace("```", "").strip()

        return VisionGenerationResponse(code=clean_code)

    except Exception as e:
        logger.error(f"Vision API generation failed: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="The Vision Engine failed to analyze the image. Please ensure the image is clear and try again."
        )