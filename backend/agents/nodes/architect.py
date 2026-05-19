import logging
from typing import Dict, Any
from langchain_openai import ChatOpenAI
from langchain_core.prompts import ChatPromptTemplate
from core.config import settings
from agents.state import CurriculumState
from schemas.roadmap_schema import AIRoadmapGeneration

# Configure enterprise logging for monitoring async agent execution events
logger = logging.getLogger(__name__)

def get_architect_llm() -> ChatOpenAI:
    """
    Initializes the OpenAI client for the Multi-LLM Router Architecture.
    Role: Roadmap Generation (Architect)
    Model: gpt-4o-mini (or as configured in ROADMAP_LLM_MODEL)
    
    Temperature is kept low (0.2) to ensure deterministic and structured JSON outputs.
    Max retries increased for production resilience during network timeouts.
    """
    return ChatOpenAI(
        api_key=settings.OPENAI_API_KEY,
        model=settings.ROADMAP_LLM_MODEL,  # Explicitly routed to the Roadmap LLM
        temperature=0.2,
        max_retries=3  # Enterprise Guardrail: Auto-retry on API failures
    )

async def architect_node(state: CurriculumState) -> Dict[str, Any]:
    """
    The Architect Agent. Generates or revises the curriculum roadmap.
    [ENTERPRISE OPTIMIZATION]: Upgraded to fully asynchronous execution (`ainvoke`) 
    to unblock the FastAPI event loop and allow real-time Server-Sent Events (SSE).
    """
    logger.info(f"Architect Agent [Model: {settings.ROADMAP_LLM_MODEL}]: Asynchronously generating roadmap for domain '{state['target_domain']}'...")

    llm = get_architect_llm()
    
    # Enforce Pydantic schema strictly on the LLM output to guarantee API contract compliance
    structured_llm = llm.with_structured_output(AIRoadmapGeneration)

    # Build context from previous reviewer rejections if this is a remediation loop
    feedback_context = ""
    if state.get("reviewer_feedback"):
        feedback_context = "PREVIOUS REJECTION FEEDBACK:\n" + "\n".join(state["reviewer_feedback"])
        feedback_context += "\nYou MUST fix the above issues in this revised roadmap."

    prompt = ChatPromptTemplate.from_messages([
        ("system", "You are an expert academic curriculum architect. Your job is to generate a highly detailed, personalized learning roadmap. "
                   "Output strictly in the requested JSON format. Distribute the workload evenly based on the constraints."),
        ("human", "Target Domain: {target_domain}\n"
                  "Student Skill Level: {skill_level}\n"
                  "Available Time: {weekly_hours} hours per week\n\n"
                  "{feedback_context}\n\n"
                  "Generate the week-by-week curriculum.")
    ])

    # Construct the execution chain
    chain = prompt | structured_llm

    try:
        # Execute the LLM call asynchronously using LangChain expression language (LCEL)
        response: AIRoadmapGeneration = await chain.ainvoke({
            "target_domain": state["target_domain"],
            "skill_level": state["skill_level"],
            "weekly_hours": state["weekly_hours"],
            "feedback_context": feedback_context
        })

        # Convert Pydantic model to a standard dictionary for LangGraph state storage
        draft_dict = response.model_dump()
        current_revisions = state.get("revision_count", 0)

        logger.info(f"Architect Agent: Draft successfully generated (Revision {current_revisions}).")

        # Update and return the new LangGraph state
        return {
            "draft_roadmap": draft_dict,
            "revision_count": current_revisions + 1
        }

    except Exception as e:
        logger.error(f"Architect Agent Async Execution Failed: {str(e)}")
        # Append error to state safely without crashing the LangGraph execution flow
        return {"errors": [f"Architect Error: {str(e)}"]}