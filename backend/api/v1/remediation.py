import logging
import uuid
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select

from db.session import get_db
from models.user import User
from models.roadmap import Task, TaskStatus
from api.v1.auth import get_current_user

# Import the AI Agent
from agents.remediation_agent import remediation_agent, RemediationPlan

logger = logging.getLogger(__name__)

# Register the new router
router = APIRouter(prefix="/remediation", tags=["AI Remediation Engine"])

# =======================================================================
# API Endpoints
# =======================================================================

@router.post("/generate-guide/{task_id}", response_model=RemediationPlan)
async def generate_remediation_guide(
    task_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Triggers the AI Remediation Agent to analyze the student's previous failure 
    using the exact failed submission saved in the SQL database.
    """
    # 1. Fetch the target task and verify it exists
    result = await db.execute(select(Task).where(Task.id == task_id))
    task = result.scalar_one_or_none()

    if not task:
        logger.warning(f"Remediation attempted on non-existent task {task_id} by User {current_user.id}")
        raise HTTPException(status_code=404, detail="Task not found in the database.")
        
    # 2. Enterprise Logic: Ensure the task actually needs remediation
    if task.status != TaskStatus.NEEDS_REMEDIATION:
        logger.warning(f"User {current_user.id} tried to remediate task {task_id} which is in {task.status} status.")
        raise HTTPException(
            status_code=400, 
            detail="This task does not currently require remediation."
        )

    logger.info(f"Triggering Remediation AI Agent for Task: {task.title} (User: {current_user.id})")

    # 3. Trigger the AI Agent dynamically using the exact SQL submission log
    try:
        # 🚨 THE FIX: Passing the actual failed submission from DB directly to AI
        guide = await remediation_agent.agenerate_remediation_guide(
            task_title=task.title,
            task_type=task.task_type.value,
            score=task.achieved_score or 0.0,
            last_submission=task.last_submission or "No submission data found. The student may have failed due to an empty submission."
        )
        return guide
        
    except Exception as e:
        logger.error(f"Remediation Agent execution failed: {str(e)}")
        raise HTTPException(
            status_code=500, 
            detail="The AI Tutor failed to generate the study guide. Please try again in a moment."
        )