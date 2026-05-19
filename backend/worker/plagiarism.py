import logging
from typing import Optional
from sqlalchemy.ext.asyncio import AsyncSession
from langchain_openai import ChatOpenAI
from langchain_core.prompts import ChatPromptTemplate
from pydantic import BaseModel, Field

from core.config import settings

logger = logging.getLogger(__name__)

# =======================================================================
# Pydantic Schema for Strict Output Parsing
# =======================================================================
class PlagiarismEvaluation(BaseModel):
    similarity_score: float = Field(
        ..., 
        ge=0.0, 
        le=100.0, 
        description="Probability (0-100) that the code is heavily plagiarized or generic boilerplate."
    )
    analysis_reasoning: str = Field(
        ..., 
        description="Brief explanation of why this similarity score was assigned."
    )

# =======================================================================
# Core Plagiarism Detection Logic
# =======================================================================
async def evaluate_code_similarity(source_code: str, student_id: str, db: AsyncSession) -> Optional[float]:
    """
    Evaluates the submitted code for potential plagiarism using advanced LLM heuristic analysis.
    It checks for generic exact-match tutorial boilerplate vs uniquely authored logic.
    
    Returns a float representing the plagiarism probability score (0.0 to 100.0).
    Returns None if the evaluation service is temporarily unavailable.
    """
    logger.info(f"Initiating code plagiarism analysis for student ID: {student_id}")

    # Enterprise Safety: Skip evaluation if code is extremely short (e.g., just 'print("Hello")')
    if len(source_code.strip()) < 20:
        logger.warning("Submitted code is too short for meaningful plagiarism analysis. Defaulting to 0.0")
        return 0.0

    try:
        # We use a deterministic, low-temperature LLM setup for consistent heuristic analysis
        llm = ChatOpenAI(
            api_key=settings.OPENAI_API_KEY,
            model=settings.OPENAI_MODEL_NAME,
            temperature=0.0, 
            max_retries=2
        )
        
        structured_evaluator = llm.with_structured_output(PlagiarismEvaluation)
        
        prompt = ChatPromptTemplate.from_messages([
            ("system", 
             "You are an expert academic integrity evaluator and senior software engineer. "
             "Analyze the provided Python source code. Determine the probability (from 0.0 to 100.0) "
             "that this code is completely copy-pasted from standard internet tutorials, StackOverflow, "
             "or AI generation tools, rather than being originally authored by a student. "
             "Generic boilerplate increases the score. Unique variable naming, custom comments, "
             "and specific logical flow decreases the score. "
             "Return the evaluation in the strictly requested JSON format."),
            ("human", "Student Code for Evaluation:\n\n{code}")
        ])
        
        chain = prompt | structured_evaluator
        
        # Execute the evaluation asynchronously
        evaluation: PlagiarismEvaluation = await chain.ainvoke({"code": source_code})
        
        logger.info(f"Plagiarism check complete for {student_id}. Score: {evaluation.similarity_score}% - Reason: {evaluation.analysis_reasoning}")
        
        return evaluation.similarity_score

    except Exception as e:
        # We catch all exceptions to ensure the main auto-grader pipeline in tasks.py NEVER crashes 
        # just because the external plagiarism API timed out or failed.
        logger.error(f"Plagiarism detection service failed: {str(e)}")
        return None