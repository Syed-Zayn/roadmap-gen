import logging
from typing import List, Dict
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
from langchain_openai import ChatOpenAI
from langchain_core.prompts import ChatPromptTemplate

from core.config import settings
from models.user import User
from api.v1.auth import get_current_user

# Initialize logging for monitoring assessment generation events
logger = logging.getLogger(__name__)
router = APIRouter(prefix="/assessment", tags=["Pre-Assessment AI Engine"])

# =======================================================================
# Pydantic Schemas for Strict Input/Output Validation
# =======================================================================

class QuizQuestion(BaseModel):
    id: str = Field(..., description="Unique question identifier (e.g., q1, q2)")
    question_text: str = Field(..., description="The main question")
    options: List[str] = Field(..., description="List of EXACTLY 4 possible answers as strings")
    correct_option: str = Field(..., description="The EXACT string of the correct option from the options list")

class QuizGenerationResponse(BaseModel):
    questions: List[QuizQuestion] = Field(..., description="A set of 5 questions to assess the student")

class QuizGenerationRequest(BaseModel):
    target_domain: str = Field(..., description="The subject the student wants to learn (e.g., Python, React)")

class QuizEvaluateRequest(BaseModel):
    target_domain: str
    answers: Dict[str, str] = Field(..., description="A dictionary mapping question_id to the selected option string")

class QuizEvaluateResponse(BaseModel):
    score_percentage: float
    skill_level: str
    feedback: str

# =======================================================================
# Endpoints
# =======================================================================

@router.post("/generate", response_model=QuizGenerationResponse)
async def generate_pre_assessment(
    request: QuizGenerationRequest,
    current_user: User = Depends(get_current_user)
):
    """
    Dynamically generates a 5-question pre-assessment quiz based on the target domain.
    Utilizes standard OpenAI Chat models with structured output capabilities.
    """
    logger.info(f"Generating Pre-Assessment for domain: {request.target_domain} (User: {current_user.id})")
    
    try:
        # Initialize LangChain OpenAI integration
        llm = ChatOpenAI(
            api_key=settings.OPENAI_API_KEY,
            model="gpt-4o-mini", # Hardcoded to standard model to avoid config errors, can be swapped to settings later
            temperature=0.3
        )
        
        # Enforce structured JSON output matching the Pydantic Schema
        structured_llm = llm.with_structured_output(QuizGenerationResponse)
        
        prompt = ChatPromptTemplate.from_messages([
            ("system", "You are an expert technical evaluator. Generate exactly 5 multiple choice questions "
                       "ranging from basic to advanced to determine a student's prior knowledge in the requested domain. "
                       "Each question must have exactly 4 string options. The correct_option must perfectly match one of the string options."),
            ("human", "Create a pre-assessment quiz for the following domain: {target_domain}")
        ])
        
        # Chain execution to generate quiz
        chain = prompt | structured_llm
        quiz: QuizGenerationResponse = chain.invoke({"target_domain": request.target_domain})
        
        return quiz
        
    except Exception as e:
        logger.error(f"Failed to generate assessment via OpenAI: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="AI Engine failed to generate the assessment. Please verify your OpenAI API connection."
        )

@router.post("/evaluate", response_model=QuizEvaluateResponse)
async def evaluate_pre_assessment(
    payload: QuizEvaluateRequest,
    current_user: User = Depends(get_current_user)
):
    """
    Evaluates the submitted quiz answers and determines the baseline skill level.
    This level directly influences the depth and complexity of the generated roadmap.
    
    *Note in Enterprise App: Normally we validate against a database. For this dynamic 
    stateless assessment, we rely on the AI to re-evaluate or use a hidden cache. 
    Here, we generate a fresh evaluation using an LLM to judge the submitted answers.*
    """
    logger.info(f"Evaluating Pre-Assessment for domain: {payload.target_domain} (User: {current_user.id})")
    
    try:
        llm = ChatOpenAI(
            api_key=settings.OPENAI_API_KEY,
            model="gpt-4o-mini",
            temperature=0.1
        )
        
        structured_llm = llm.with_structured_output(QuizEvaluateResponse)
        
        # We ask the AI to grade the test since we didn't store the dynamically generated questions in the DB
        prompt = ChatPromptTemplate.from_messages([
            ("system", "You are an expert examiner. You are given a student's answers to a quiz about {target_domain}. "
                       "Evaluate their answers. Calculate a score percentage (0 to 100). "
                       "If score < 40, skill_level is 'Beginner'. If score between 40 and 70, skill_level is 'Intermediate'. "
                       "If score > 70, skill_level is 'Advanced'. Provide a brief 1-sentence feedback."),
            ("human", "Student Answers mapping (Question ID to Selected Answer): {answers}")
        ])
        
        chain = prompt | structured_llm
        evaluation: QuizEvaluateResponse = chain.invoke({
            "target_domain": payload.target_domain,
            "answers": str(payload.answers)
        })
        
        return evaluation

    except Exception as e:
        logger.error(f"Failed to evaluate assessment via OpenAI: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to grade the assessment."
        )