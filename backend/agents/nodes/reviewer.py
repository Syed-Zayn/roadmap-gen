import logging
from typing import Dict, Any, List
from pydantic import BaseModel, Field
from langchain_openai import ChatOpenAI
from langchain_core.prompts import ChatPromptTemplate
from core.config import settings
from agents.state import CurriculumState

# Initialize logging to monitor validation loops and QA checks
logger = logging.getLogger(__name__)

# Schema strictly used by the Reviewer LLM to enforce binary decisions and clear feedback
class ReviewResult(BaseModel):
    is_approved: bool = Field(..., description="True if the roadmap fits the constraints perfectly, False otherwise.")
    feedback: List[str] = Field(..., description="Specific issues found that the Architect must fix. Empty if approved.")

def get_reviewer_llm() -> ChatOpenAI:
    """
    Initializes a standard OpenAI Chat model for quick QA checks.
    Temperature is zero for strict, deterministic evaluation without creative hallucination.
    """
    return ChatOpenAI(
        api_key=settings.OPENAI_API_KEY,
        model=settings.OPENAI_MODEL_NAME, # Optimized to use gpt-4o-mini from config
        temperature=0.0 
    )

def reviewer_node(state: CurriculumState) -> Dict[str, Any]:
    """
    The Reviewer Agent. Validates the draft_roadmap against user constraints.
    Triggers the remediation loop by returning is_approved=False if criteria fail.
    """
    logger.info("Reviewer Agent: Evaluating the drafted curriculum...")

    draft = state.get("draft_roadmap")
    if not draft:
        logger.error("Reviewer Agent: No draft roadmap found in state.")
        return {"errors": ["Reviewer Error: No draft available to review."], "is_approved": False}

    llm = get_reviewer_llm()
    # Enforce Pydantic schema strictly on the Reviewer's output to guarantee logical boolean flags
    structured_reviewer = llm.with_structured_output(ReviewResult)

    prompt = ChatPromptTemplate.from_messages([
        ("system", "You are an uncompromising Quality Assurance auditor for an educational platform. "
                   "Analyze the provided JSON curriculum. "
                   "RULES:\n"
                   "1. Ensure the total 'estimated_hours' for all tasks in ANY given week does NOT exceed the student's 'weekly_hours'.\n"
                   "2. Ensure the complexity matches the '{skill_level}' skill level.\n"
                   "If it fails ANY rule, return is_approved=false and list the exact violations."),
        ("human", "Constraints:\n"
                  "Skill Level: {skill_level}\n"
                  "Max Weekly Hours: {weekly_hours}\n\n"
                  "Draft Roadmap:\n{draft}\n\n"
                  "Review this now.")
    ])

    # Chain execution to perform QA
    chain = prompt | structured_reviewer

    try:
        review: ReviewResult = chain.invoke({
            "skill_level": state["skill_level"],
            "weekly_hours": state["weekly_hours"],
            "draft": draft
        })

        if review.is_approved:
            logger.info("Reviewer Agent: Roadmap APPROVED. Proceeding to curation.")
            return {"is_approved": True}
        else:
            logger.warning(f"Reviewer Agent: Roadmap REJECTED. Issues: {review.feedback}")
            return {
                "is_approved": False,
                # Append rejection feedback to the state history so the Architect can fix it
                "reviewer_feedback": review.feedback 
            }

    except Exception as e:
        logger.error(f"Reviewer Agent Failed: {str(e)}")
        # If the LLM call fails, default to rejecting to ensure faulty data doesn't slip through
        return {"errors": [f"Reviewer Error: {str(e)}"], "is_approved": False}