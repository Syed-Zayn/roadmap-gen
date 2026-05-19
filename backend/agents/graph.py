import logging
from langgraph.graph import StateGraph, END
from agents.state import CurriculumState

# Import node functions (these must be awaited internally by LangGraph)
from agents.nodes.architect import architect_node
from agents.nodes.reviewer import reviewer_node
from agents.nodes.curator import curator_node
from agents.nodes.remediator import remediator_node

# Configure system logger
logger = logging.getLogger(__name__)

def evaluate_review_status(state: CurriculumState) -> str:
    """
    Synchronous routing function to determine the next node based on the QA review.
    Evaluates the state payload returned by the Reviewer Agent.
    """
    is_approved = state.get("is_approved", False)
    revision_count = state.get("revision_count", 0)

    if is_approved:
        logger.info("Routing: Roadmap approved. Proceeding to Curator Agent.")
        return "curator"
    
    # Enterprise Guardrail: Prevent infinite LLM loops to save compute/costs
    if revision_count >= 2:
        logger.warning(f"Routing: Maximum revisions ({revision_count}) reached. Forcing progression to Curator Agent to prevent infinite loop.")
        return "curator"
    
    logger.info(f"Routing: Roadmap rejected. Routing back to Architect Agent for Revision {revision_count + 1}.")
    return "architect"

def build_curriculum_graph() -> StateGraph:
    """
    Compiles the asynchronous LangGraph state machine for Curriculum Generation.
    Supports real-time state streaming (SSE) to the frontend.
    """
    workflow = StateGraph(CurriculumState)

    # Register all processing nodes
    workflow.add_node("architect", architect_node)
    workflow.add_node("reviewer", reviewer_node)
    workflow.add_node("curator", curator_node)

    # Define the starting point of the state machine
    workflow.set_entry_point("architect")

    # Define strict edges (Architect always goes to Reviewer)
    workflow.add_edge("architect", "reviewer")

    # Define conditional branching based on the reviewer's output
    workflow.add_conditional_edges(
        "reviewer",
        evaluate_review_status,
        {
            "curator": "curator",
            "architect": "architect"
        }
    )

    # Terminate the graph after curation
    workflow.add_edge("curator", END)

    # Compile the graph into a highly optimized executable format
    app = workflow.compile()
    
    return app

def build_remediation_graph() -> StateGraph:
    """
    Compiles the asynchronous LangGraph state machine for Adaptive Remediation.
    Triggered when a student fails a sandbox task or quiz.
    """
    workflow = StateGraph(CurriculumState)

    workflow.add_node("remediator", remediator_node)
    workflow.add_node("curator", curator_node)

    workflow.set_entry_point("remediator")

    # Remediator creates a micro-lesson, Curator fetches resources for it
    workflow.add_edge("remediator", "curator")
    workflow.add_edge("curator", END)

    app = workflow.compile()
    
    return app

# Export the globally compiled graph executors to be used by the FastAPI endpoints
agent_executor = build_curriculum_graph()
remediation_executor = build_remediation_graph()