import logging
from typing import List, Dict
from pydantic import BaseModel, Field
from langchain_openai import ChatOpenAI
from langchain_core.prompts import ChatPromptTemplate

from core.config import settings

# Configure logging for the AI Agent
logger = logging.getLogger(__name__)

# =======================================================================
# Strict Pydantic Schemas for LangChain Structured Output
# These ensure the LLM never hallucinates the JSON structure.
# =======================================================================

class QuizQuestion(BaseModel):
    id: str = Field(..., description="Unique question identifier (e.g., q1, q2, q3)")
    question_text: str = Field(..., description="The main technical question")
    options: List[str] = Field(..., description="A list containing EXACTLY 4 possible string answers")
    correct_option: str = Field(..., description="The exact string matching the correct answer from the options list")

class QuizGenerationResponse(BaseModel):
    questions: List[QuizQuestion] = Field(..., description="A strict set of 5 multiple-choice questions")

class QuizEvaluateResponse(BaseModel):
    score_percentage: float = Field(..., description="The calculated score from 0.0 to 100.0")
    skill_level: str = Field(..., description="Must be exactly one of: 'Beginner', 'Intermediate', 'Advanced'")
    feedback: str = Field(..., description="A single sentence of encouraging feedback based on the performance")

# =======================================================================
# Enterprise Assessment Agent Class
# Separates AI logic from the FastAPI controllers (Separation of Concerns)
# =======================================================================

class PreAssessmentAgent:
    def __init__(self):
        """
        Initializes the standard LangChain OpenAI model.
        Uses lower temperature for deterministic and highly accurate evaluation.
        """
        try:
            self.llm = ChatOpenAI(
                api_key=settings.OPENAI_API_KEY,
                model=settings.OPENAI_MODEL_NAME, # Typically "gpt-4o" or "gpt-4o-mini"
                temperature=0.2 # Low temperature for analytical consistency
            )
        except Exception as e:
            logger.error(f"Failed to initialize Assessment Agent LLM: {str(e)}")
            raise

    async def agenerate_quiz(self, target_domain: str) -> QuizGenerationResponse:
        """
        Asynchronously generates a targeted 5-question MCQs quiz.
        Forces the LLM to adhere to the QuizGenerationResponse schema.
        """
        logger.info(f"Agent generating pre-assessment for domain: {target_domain}")
        
        structured_llm = self.llm.with_structured_output(QuizGenerationResponse)
        
        prompt = ChatPromptTemplate.from_messages([
            ("system", "You are an expert technical examiner. Your task is to generate exactly 5 multiple choice questions "
                       "to determine a student's prior knowledge in the requested domain. The difficulty should range "
                       "from fundamental to advanced.\n\n"
                       "CRITICAL CONSTRAINTS:\n"
                       "1. You must provide exactly 4 options per question.\n"
                       "2. The 'correct_option' must be an exact string match to one of the 4 options.\n"
                       "3. Do not include markdown formatting like ```json in the output."),
            ("human", "Create a pre-assessment quiz for the following domain: {target_domain}")
        ])
        
        try:
            chain = prompt | structured_llm
            response = await chain.ainvoke({"target_domain": target_domain})
            return response
        except Exception as e:
            logger.error(f"Agent failed to generate quiz content: {str(e)}")
            raise RuntimeError("Assessment generation failed at the AI layer.")

    async def aevaluate_quiz(self, target_domain: str, answers: Dict[str, str]) -> QuizEvaluateResponse:
        """
        Asynchronously evaluates the submitted answers.
        Since the quiz is dynamically generated and stateless, the LLM analyzes the selected text
        against the domain context to grade the submission.
        """
        logger.info(f"Agent evaluating assessment for domain: {target_domain}")
        
        structured_llm = self.llm.with_structured_output(QuizEvaluateResponse)
        
        prompt = ChatPromptTemplate.from_messages([
            ("system", "You are an expert examiner. You are provided with a student's submitted answers to a quiz "
                       "about the domain: {target_domain}. "
                       "Analyze their selected answers for technical accuracy. Calculate an estimated score percentage (0 to 100). "
                       "Categorize their skill_level STRICTLY as one of the following:\n"
                       "- 'Beginner' (Score < 40)\n"
                       "- 'Intermediate' (Score between 40 and 75)\n"
                       "- 'Advanced' (Score > 75)\n"
                       "Provide a brief, 1-sentence personalized feedback."),
            ("human", "Here is the mapping of Question IDs to the Student's Selected Answers:\n{answers}")
        ])
        
        try:
            chain = prompt | structured_llm
            response = await chain.ainvoke({
                "target_domain": target_domain,
                "answers": str(answers) # Convert dict to string for the prompt
            })
            return response
        except Exception as e:
            logger.error(f"Agent failed to evaluate quiz submission: {str(e)}")
            raise RuntimeError("Assessment evaluation failed at the AI layer.")

# Export a singleton instance to be imported directly by the API router
assessment_agent = PreAssessmentAgent()