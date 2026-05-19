import logging
from typing import Dict, Any
from langchain_openai import ChatOpenAI
from langchain_core.prompts import ChatPromptTemplate
from core.config import settings
from agents.state import CurriculumState
from schemas.roadmap_schema import AIRoadmapGeneration

# Configure logging for tracking remediation generation
logger = logging.getLogger(__name__)

def get_remediator_llm() -> ChatOpenAI:
    """
    Initializes the OpenAI client optimized for educational remediation.
    Temperature is kept low (0.2) to ensure factual accuracy and strict adherence 
    to the required JSON structure.
    """
    return ChatOpenAI(
        api_key=settings.OPENAI_API_KEY,
        model=settings.OPENAI_MODEL_NAME,
        temperature=0.2,
        max_retries=3
    )

def remediator_node(state: CurriculumState) -> Dict[str, Any]:
    """
    The Remediator Agent. Triggered when a student fails a task or assessment.
    It takes the failed topic (passed via target_domain) and generates a targeted
    micro-lesson or crash course. The output is structured as a mini-roadmap
    so that the Curator agent can process it seamlessly and attach RAG resources.
    """
    failed_topic = state.get("target_domain", "Unknown Topic")
    skill_level = state.get("skill_level", "Beginner")
    
    logger.info(f"Remediator Agent: Generating adaptive micro-lessons for failed topic: '{failed_topic}'...")

    llm = get_remediator_llm()
    
    # Enforce Pydantic schema strictly so the output integrates seamlessly 
    # with the downstream Curator node and frontend timeline
    structured_llm = llm.with_structured_output(AIRoadmapGeneration)

    prompt = ChatPromptTemplate.from_messages([
        ("system", 
         "You are an empathetic and highly skilled academic tutor. "
         "Your student has just failed an assessment on a specific topic. "
         "Generate a highly targeted, step-by-step 'Micro-Lesson Roadmap' to help them recover and understand the concepts. "
         "Break the complex topic into 2 or 3 smaller, easily digestible tasks (e.g., theory explanation, followed by a simple practice task). "
         "Assign exactly 1 milestone named 'Remediation: <Topic>'. "
         "Keep the estimated hours very low (e.g., 0.5 to 1.0 hours per task). "
         "Return the output strictly in the requested JSON format."),
        ("human", 
         "Failed Topic Context: {failed_topic}\n"
         "Student's Current Skill Level: {skill_level}\n\n"
         "Please generate the adaptive remediation micro-lessons now.")
    ])

    chain = prompt | structured_llm

    try:
        # Execute the LLM reasoning loop
        response: AIRoadmapGeneration = chain.invoke({
            "failed_topic": failed_topic,
            "skill_level": skill_level
        })

        # Convert Pydantic model to a standard dictionary for LangGraph state
        draft_dict = response.model_dump()

        logger.info(f"Remediator Agent: Micro-lessons successfully generated for '{failed_topic}'. Passing to Curator.")

        # Update and return the LangGraph state. 
        # We place it in 'draft_roadmap' so the existing curator_node can pick it up effortlessly.
        return {
            "draft_roadmap": draft_dict,
            # Resetting errors just in case previous nodes had issues
            "errors": []
        }

    except Exception as e:
        logger.error(f"Remediator Agent Execution Failed: {str(e)}")
        # Append error to state safely without completely crashing the execution thread
        return {
            "errors": [f"Remediator Agent Error: {str(e)}"]
        }