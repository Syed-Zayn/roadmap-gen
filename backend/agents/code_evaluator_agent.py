import logging
from pydantic import BaseModel, Field
from langchain_anthropic import ChatAnthropic
from langchain_core.prompts import ChatPromptTemplate

from core.config import settings

# Configure logging for the AI Evaluator
logger = logging.getLogger(__name__)

# =======================================================================
# Strict Pydantic Schema for Code Evaluation
# This ensures the LLM always returns a highly structured, parseable JSON.
# =======================================================================

class CodeEvaluationResult(BaseModel):
    actual_output: str = Field(
        ..., 
        description="The simulated stdout console output of the code. If there are syntax or logic errors, return the exact compiler error/traceback for the specific language."
    )
    score_percentage: float = Field(
        ..., 
        description="A grade from 0.0 to 100.0 representing how well the code fulfills the task description."
    )
    feedback: str = Field(
        ..., 
        description="A helpful, encouraging, yet critical 1-2 sentence feedback explaining what went right and what needs fixing."
    )

# =======================================================================
# Enterprise Code Evaluator Agent (Powered by Claude)
# =======================================================================

class CodeEvaluatorAgent:
    def __init__(self):
        """
        Initializes the LangChain Anthropic model specifically for code evaluation.
        Role: Code Sandboxing & Grading
        Model: Claude 3.5 Sonnet (or as configured in CODE_LLM_MODEL)
        
        Uses a very low temperature for analytical consistency (we want strict grading, not creative writing).
        """
        try:
            self.llm = ChatAnthropic(
                api_key=settings.ANTHROPIC_API_KEY,
                model=settings.CODE_LLM_MODEL, # Explicitly routed to the Coding LLM (Claude)
                temperature=0.0,               # Zero creativity; strict adherence to rules
                max_retries=3                  # Enterprise Guardrail
            )
            logger.info(f"Code Evaluator Engine initialized with model: {settings.CODE_LLM_MODEL}")
        except Exception as e:
            logger.error(f"Failed to initialize Anthropic Code Evaluator LLM: {str(e)}")
            raise

    # 🚨 THE FIX (Issue 6): Added 'language' parameter to dynamically adjust the AI's compiler rules
    async def aevaluate_code(
        self, 
        task_title: str, 
        task_description: str, 
        student_code: str, 
        language: str = "Python 3"
    ) -> CodeEvaluationResult:
        """
        Asynchronously evaluates the submitted code against the specific task context and programming language.
        """
        logger.info(f"Anthropic Agent evaluating {language} code submission for task: '{task_title}'")
        
        # Enforce structured output (Langchain seamlessly translates Pydantic to Claude's XML/Tool calling)
        structured_llm = self.llm.with_structured_output(CodeEvaluationResult)
        
        # System prompt dynamically injects the target language context
        prompt = ChatPromptTemplate.from_messages([
            ("system", "You are an elite Senior Software Engineer and Compiler acting as an automated grader. "
                       "Your job is to read the provided Task Title and Description, then execute (simulate) the Student's Code "
                       "written in '{language}' strictly adhering to that language's syntax and runtime behavior.\n\n"
                       "CRITICAL INSTRUCTIONS:\n"
                       "1. 'actual_output': Provide what the standard console output would be for a {language} program. "
                       "If the code has errors (Syntax, Indentation, Compilation, etc.), return the exact {language} Traceback/Compiler Error.\n"
                       "2. 'score_percentage': Grade the code strictly out of 100. Consider logic, correctness, and fulfillment of the task.\n"
                       "3. 'feedback': Keep it under 2 sentences. Be direct. E.g., 'Good logic, but you missed handling the edge case when the array is empty.'"),
            ("human", "TASK TITLE: {title}\n\nTASK DESCRIPTION:\n{description}\n\nSTUDENT'S SOURCE CODE ({language}):\n```\n{code}\n```")
        ])
        
        try:
            chain = prompt | structured_llm
            response = await chain.ainvoke({
                "title": task_title,
                "description": task_description,
                "code": student_code,
                "language": language
            })
            return response
        except Exception as e:
            logger.error(f"Anthropic Agent failed to evaluate {language} code: {str(e)}")
            raise RuntimeError("Code evaluation failed at the AI layer.")

# Export a singleton instance to be used by the Sandbox API route
code_evaluator_agent = CodeEvaluatorAgent()