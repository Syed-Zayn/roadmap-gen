import logging
from pydantic import BaseModel, Field
from langchain_openai import ChatOpenAI
from langchain_core.prompts import ChatPromptTemplate

from core.config import settings

# Configure structured logging for the Remediation AI
logger = logging.getLogger(__name__)

# =======================================================================
# Strict Pydantic Schema for Remediation Response
# Ensures the frontend always receives clean, structured JSON.
# =======================================================================

class RemediationPlan(BaseModel):
    task_title: str = Field(..., description="The original title of the task")
    task_type: str = Field(..., description="CODING or QUIZ")
    previous_score: float = Field(..., description="The student's last achieved score")
    weakness_analysis: str = Field(
        ..., 
        description="A direct analysis of why the student failed based on their last attempt."
    )
    study_guide: str = Field(
        ..., 
        description="A detailed, supportive micro-lesson (Markdown formatted) to help the student understand the missing concepts."
    )

# =======================================================================
# Enterprise Remediation Agent Class (SQL-Backed)
# Analyzes the exact failed submission instead of using vector search.
# =======================================================================

class RemediationAgent:
    def __init__(self):
        """
        Initializes the LLM for high-quality pedagogical response generation.
        Temperature set to 0.4 to allow for helpful, teacher-like explanation variety.
        """
        try:
            self.llm = ChatOpenAI(
                api_key=settings.OPENAI_API_KEY,
                model="gpt-4o-mini", # Optimized for reasoning and fast response
                temperature=0.4
            )
        except Exception as e:
            logger.error(f"Failed to initialize Remediation Agent LLM: {str(e)}")
            raise

    async def agenerate_remediation_guide(
        self, 
        task_title: str, 
        task_type: str, 
        score: float,
        last_submission: str
    ) -> RemediationPlan:
        """
        The core Remediation engine:
        Takes the exact failed code or quiz answers from the PostgreSQL database,
        synthesizes it, and generates a personalized lesson to bridge the knowledge gap.
        """
        logger.info(f"Agent generating SQL-backed remediation guide for Task: {task_title}")

        structured_llm = self.llm.with_structured_output(RemediationPlan)

        prompt = ChatPromptTemplate.from_messages([
            ("system", "You are an elite AI Pedagogical Expert. Your mission is to help students recover from failures.\n\n"
                       "You will be given the student's previous score and their EXACT failed submission (either raw source code or JSON quiz answers). "
                       "Your job is to:\n"
                       "1. Analyze exactly where the student is struggling based on this submission.\n"
                       "2. Provide a 'Weakness Analysis' that is direct but encouraging.\n"
                       "3. Create a 'Study Guide' (Micro-lesson) that explains the core concepts they missed. "
                       "Use Markdown (bold, code blocks) to make it highly readable.\n\n"
                       "CRITICAL: Do not just give them the answers. Explain the underlying logic so they can pass on their own next time."),
            ("human", "TASK: {title} ({type})\n"
                       "PREVIOUS SCORE: {score}%\n"
                       "STUDENT'S FAILED SUBMISSION:\n{submission}")
        ])

        try:
            chain = prompt | structured_llm
            remediation_plan = await chain.ainvoke({
                "title": task_title,
                "type": task_type,
                "score": score,
                "submission": last_submission
            })
            return remediation_plan
            
        except Exception as e:
            logger.error(f"AI Remediation Generation failed: {str(e)}")
            raise RuntimeError("The AI Tutor is currently analyzing your data. Please try again in a moment.")

# Export a singleton instance
remediation_agent = RemediationAgent()