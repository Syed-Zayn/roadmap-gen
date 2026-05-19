import uuid
import logging
from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from sqlalchemy import update

from db.session import get_db
from models.user import User
from models.progress import Progress, GradingStatus
from models.roadmap import Task, TaskType, TaskStatus
from api.v1.auth import get_current_user

from agents.code_evaluator_agent import code_evaluator_agent

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/sandbox", tags=["Auto-Grader Execution & Task State Machine"])

# =======================================================================
# Pydantic Validation Schemas
# =======================================================================
class CodeSubmitRequest(BaseModel):
    """
    Schema validating the incoming code payload from the frontend IDE.
    """
    task_id: uuid.UUID = Field(..., description="The ID of the coding task being attempted")
    source_code: str = Field(..., min_length=1, description="The raw source code submitted by the student")
    # 🚨 THE FIX (Issue 6): Added language parameter for multi-language support
    language: str = Field(default="Python 3", description="The programming language of the submitted code")

class ResourceSubmitRequest(BaseModel):
    """
    Schema validating the manual completion of a RESOURCE task (e.g. Video/Article).
    """
    code: str = Field(..., description="Dummy payload acknowledging completion")

# =======================================================================
# Helper Function: Gamification Engine
# =======================================================================
async def update_user_gamification(db: AsyncSession, user_id: uuid.UUID, points_to_add: int) -> str:
    """
    Enterprise Gamification Logic: Calculates daily streaks and assigns XP points.
    Updates the database dynamically.
    """
    user_result = await db.execute(select(User).where(User.id == user_id))
    db_user = user_result.scalar_one()
    
    now = datetime.now(timezone.utc)
    
    # Calculate streak based on the last activity date
    if db_user.last_activity_date:
        delta_days = (now.date() - db_user.last_activity_date.date()).days
        if delta_days == 1:
            # Consecutive day: Increment streak
            db_user.current_streak += 1
        elif delta_days > 1:
            # Streak broken: Reset to 1
            db_user.current_streak = 1
        # If delta_days == 0, they already did a task today, streak remains the same.
    else:
        # First time completing a task
        db_user.current_streak = 1
        
    # Update max streak if current breaks the record
    if db_user.current_streak > db_user.max_streak:
        db_user.max_streak = db_user.current_streak
        
    # Assign XP points
    db_user.points += points_to_add
    db_user.last_activity_date = now
    
    return f" You earned {points_to_add} XP! Current Streak: {db_user.current_streak} 🔥"

# =======================================================================
# 1. State Machine Controller: Resource Completion
# =======================================================================
@router.post("/submit/{task_id}", status_code=status.HTTP_200_OK)
async def mark_resource_completed(
    task_id: uuid.UUID,
    payload: ResourceSubmitRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Handles the manual completion of non-assessable tasks (like reading an article or watching a video).
    Strictly enforces that only RESOURCE tasks can be bypassed this way.
    Automatically unlocks the next dependent task in the State Machine.
    """
    # 1. Fetch the target task
    result = await db.execute(select(Task).where(Task.id == task_id))
    task = result.scalar_one_or_none()

    if not task:
        raise HTTPException(status_code=404, detail="Task not found.")

    # 2. Enterprise Security Guard: Prevent cheating by ensuring this is ONLY a resource
    if task.task_type != TaskType.RESOURCE:
        logger.warning(f"Cheating attempt: User {current_user.id} tried to auto-complete a {task.task_type} task.")
        raise HTTPException(
            status_code=403, 
            detail="Forbidden. Only study resources can be manually marked as completed."
        )

    # 3. Update Current Task State
    task.status = TaskStatus.COMPLETED
    task.achieved_score = 100.0

    # 4. Log the progress in history for Analytics
    progress_record = Progress(
        student_id=current_user.id,
        task_id=task.id,
        status=GradingStatus.PASS,
        score=100.0,
        execution_logs="Resource manually marked as read by student."
    )
    db.add(progress_record)

    # 5. ENTERPRISE STATE MACHINE: Auto-Unlock the Next Dependent Task
    next_task_result = await db.execute(select(Task).where(Task.prerequisite_id == task.id))
    next_task = next_task_result.scalar_one_or_none()

    unlocked_msg = ""
    if next_task and next_task.status == TaskStatus.LOCKED:
        next_task.status = TaskStatus.PENDING
        unlocked_msg = f" Successfully unlocked the next module: {next_task.title}."

    # 6. ENTERPRISE GAMIFICATION: Update Streak & Give 10 XP for Resource
    gamification_msg = await update_user_gamification(db, current_user.id, points_to_add=10)

    await db.commit()
    logger.info(f"Task {task.id} marked complete by {current_user.id}.{unlocked_msg}")

    return {
        "status": "success",
        "message": "Resource marked as completed." + unlocked_msg + gamification_msg
    }

# =======================================================================
# 2. Advanced Auto-Grader Controller: Code Submission & AI Evaluation
# =======================================================================
@router.post("/submit-code", status_code=status.HTTP_200_OK)
async def submit_coding_task(
    payload: CodeSubmitRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Accepts student code, runs it through the AI Code Evaluator agent,
    records the exact submission for Teacher HITL review, and manages the State Machine.
    """
    # 1. Verify the task exists and is a coding challenge
    result = await db.execute(select(Task).where(Task.id == payload.task_id))
    target_task = result.scalar_one_or_none()

    if not target_task:
        raise HTTPException(status_code=404, detail="Task not found.")
        
    if target_task.task_type != TaskType.CODING:
        raise HTTPException(
            status_code=400, 
            detail="Invalid submission. This task is not a coding challenge."
        )

    logger.info(f"Code submission received for Task {payload.task_id} in language {payload.language}. Triggering AI Evaluator.")

    # 2. Invoke the AI Agent to grade the code based on the task context and SPECIFIC LANGUAGE
    try:
        evaluation = await code_evaluator_agent.aevaluate_code(
            task_title=target_task.title,
            task_description=target_task.description,
            student_code=payload.source_code,
            language=payload.language # 🚨 Passing the dynamic language downstream to the AI
        )
    except Exception as e:
        logger.error(f"AI Code Evaluator failed: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="AI Evaluation Engine is currently unavailable."
        )

    # 3. Determine Pass/Fail based on AI Score
    passing_threshold = target_task.minimum_passing_score or 70.0
    passed = evaluation.score_percentage >= passing_threshold

    # 4. Update the Task record
    # Store the raw code so the teacher can view it later!
    target_task.last_submission = payload.source_code 
    target_task.achieved_score = evaluation.score_percentage
    
    unlocked_msg = ""
    gamification_msg = ""
    
    if passed:
        target_task.status = TaskStatus.COMPLETED
        # ENTERPRISE STATE MACHINE: Auto-Unlock the Next Dependent Task
        next_task_result = await db.execute(select(Task).where(Task.prerequisite_id == target_task.id))
        next_task = next_task_result.scalar_one_or_none()

        if next_task and next_task.status == TaskStatus.LOCKED:
            next_task.status = TaskStatus.PENDING
            unlocked_msg = f" Outstanding work! You have unlocked the next module: {next_task.title}."
            
        # ENTERPRISE GAMIFICATION: Update Streak & Give 50 XP for Coding Task
        gamification_msg = await update_user_gamification(db, current_user.id, points_to_add=50)
    else:
        target_task.status = TaskStatus.NEEDS_REMEDIATION
        target_task.remediation_attempts += 1

    # 5. Log the execution attempt in the Progress tracking table
    progress_record = Progress(
        student_id=current_user.id,
        task_id=payload.task_id,
        status=GradingStatus.PASS if passed else GradingStatus.FAIL,
        score=evaluation.score_percentage,
        execution_logs=evaluation.actual_output or "Executed with no standard output."
    )
    db.add(progress_record)
    
    await db.commit()

    # 6. Return comprehensive feedback to the IDE UI
    return {
        "status": "success" if passed else "error",
        "message": ("Code passed evaluation." if passed else "Code failed to meet the passing criteria.") + unlocked_msg + gamification_msg,
        "progress_id": str(progress_record.id),
        "actual_output": evaluation.actual_output,
        "ai_score": evaluation.score_percentage,
        "ai_feedback": evaluation.feedback
    }