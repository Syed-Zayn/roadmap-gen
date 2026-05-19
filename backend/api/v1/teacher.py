import csv
import io
import uuid
import logging
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.responses import StreamingResponse
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from sqlalchemy.orm import selectinload
from sqlalchemy import desc

from db.session import get_db
from models.user import User, UserRole
from models.roadmap import Roadmap, Task, TaskStatus
from models.progress import Progress, GradingStatus
from api.v1.auth import get_current_user
from pydantic import BaseModel, Field

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/teacher", tags=["Teacher Analytics & HITL"])

# =======================================================================
# Pydantic Schemas for Dashboard Analytics
# =======================================================================
class StudentProgressOverview(BaseModel):
    student_id: str
    email: str
    target_domain: Optional[str] = None
    completion_percentage: float
    is_at_risk: bool

class TeacherDashboardResponse(BaseModel):
    total_students: int
    active_roadmaps: int
    class_average_completion: float
    at_risk_students: List[StudentProgressOverview]
    all_students: List[StudentProgressOverview]

# Schemas for HITL Features (Feature 2)
class TaskDetails(BaseModel):
    id: str
    title: str
    task_type: str
    status: str
    achieved_score: Optional[float] = None
    minimum_passing_score: Optional[float] = None
    remediation_attempts: int
    last_submission: Optional[str] = None 

class StudentDetailedProfile(BaseModel):
    student_id: str
    email: str
    target_domain: str
    overall_progress: float
    total_tasks: int
    completed_tasks: int
    tasks: List[TaskDetails]

class OverrideRequest(BaseModel):
    status: str = Field(..., description="Must be COMPLETED or NEEDS_REMEDIATION")
    instructor_notes: str

# =======================================================================
# Dependencies
# =======================================================================
def verify_teacher_access(current_user: User = Depends(get_current_user)):
    """
    Dependency to enforce Role-Based Access Control.
    Only allows users with the TEACHER role to access these endpoints.
    """
    if current_user.role != UserRole.TEACHER:
        logger.warning(f"Unauthorized access attempt to Teacher Dashboard by User {current_user.id}")
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Access Denied: Only instructors can access the analytics dashboard."
        )
    return current_user

# =======================================================================
# Global Dashboard APIs
# =======================================================================
@router.get("/dashboard", response_model=TeacherDashboardResponse)
async def get_class_analytics(
    db: AsyncSession = Depends(get_db),
    teacher: User = Depends(verify_teacher_access)
):
    """
    Aggregates class data, calculates completion rates, and triggers 'At-Risk' 
    flags for students falling behind or failing quizzes.
    """
    # Fetch all students along with their active roadmaps and nested tasks
    stmt = select(User).where(User.role == UserRole.STUDENT).options(
        selectinload(User.roadmaps).selectinload(Roadmap.tasks)
    )
    result = await db.execute(stmt)
    students = result.scalars().all()

    total_students = len(students)
    active_roadmaps_count = 0
    total_completion_percentage = 0.0
    student_overviews = []
    at_risk_students = []

    for student in students:
        active_roadmap = next((r for r in student.roadmaps if r.is_active), None)
        
        completion_percentage = 0.0
        is_at_risk = False
        domain = None
        
        if active_roadmap:
            active_roadmaps_count += 1
            domain = active_roadmap.content.get("target_domain", "Unknown Domain")
            total_tasks = len(active_roadmap.tasks)
            
            if total_tasks > 0:
                completed_tasks = sum(1 for t in active_roadmap.tasks if t.status == TaskStatus.COMPLETED)
                failed_tasks = sum(1 for t in active_roadmap.tasks if t.status == TaskStatus.NEEDS_REMEDIATION)
                
                completion_percentage = (completed_tasks / total_tasks) * 100
                
                # Enterprise Logic: Identify "At-Risk" students
                if failed_tasks >= 2 or (completion_percentage < 50.0 and total_tasks > 5):
                    is_at_risk = True

        total_completion_percentage += completion_percentage
        
        overview = StudentProgressOverview(
            student_id=str(student.id),
            email=student.email,
            target_domain=domain,
            completion_percentage=round(completion_percentage, 2),
            is_at_risk=is_at_risk
        )
        
        student_overviews.append(overview)
        if is_at_risk:
            at_risk_students.append(overview)

    class_average = round((total_completion_percentage / total_students), 2) if total_students > 0 else 0.0

    return TeacherDashboardResponse(
        total_students=total_students,
        active_roadmaps=active_roadmaps_count,
        class_average_completion=class_average,
        at_risk_students=at_risk_students,
        all_students=student_overviews
    )

# =======================================================================
# Detailed Student Profile Endpoint (HITL Backend)
# =======================================================================
@router.get("/student/{student_id}", response_model=StudentDetailedProfile)
async def get_student_details(
    student_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    teacher: User = Depends(verify_teacher_access)
):
    """
    Fetches an isolated, detailed profile for a specific student to fuel the HITL dashboard.
    Now includes logic to extract the raw code/submission for the teacher to view.
    """
    # 1. Verify student exists
    student_stmt = select(User).where(User.id == student_id, User.role == UserRole.STUDENT)
    student_result = await db.execute(student_stmt)
    student = student_result.scalar_one_or_none()

    if not student:
        raise HTTPException(status_code=404, detail="Student not found.")

    # 2. Fetch their active roadmap
    roadmap_stmt = (
        select(Roadmap)
        .options(selectinload(Roadmap.tasks))
        .where(Roadmap.student_id == student.id, Roadmap.is_active == True)
    )
    roadmap_result = await db.execute(roadmap_stmt)
    active_roadmap = roadmap_result.scalar_one_or_none()

    if not active_roadmap:
        raise HTTPException(status_code=404, detail="This student currently has no active roadmap.")

    # 3. Build task list with latest submission extractions
    task_details = []
    completed_count = 0
    total_tasks = len(active_roadmap.tasks)

    # Sort tasks to maintain timeline order
    sorted_tasks = sorted(active_roadmap.tasks, key=lambda x: x.created_at)

    for t in sorted_tasks:
        if t.status == TaskStatus.COMPLETED:
            completed_count += 1
            
        submission_data = getattr(t, "last_submission", None)

        task_details.append(TaskDetails(
            id=str(t.id),
            title=t.title,
            task_type=t.task_type.value,
            status=t.status.value,
            achieved_score=t.achieved_score,
            minimum_passing_score=t.minimum_passing_score,
            remediation_attempts=t.remediation_attempts,
            last_submission=submission_data
        ))

    overall_progress = round((completed_count / total_tasks) * 100, 2) if total_tasks > 0 else 0.0

    return StudentDetailedProfile(
        student_id=str(student.id),
        email=student.email,
        target_domain=active_roadmap.content.get("target_domain", "Unknown"),
        overall_progress=overall_progress,
        total_tasks=total_tasks,
        completed_tasks=completed_count,
        tasks=task_details
    )

# =======================================================================
# Human-In-The-Loop (HITL) Manual Override API
# =======================================================================
@router.post("/override/{task_id}")
async def force_override_task_status(
    task_id: uuid.UUID,
    request: OverrideRequest,
    db: AsyncSession = Depends(get_db),
    teacher: User = Depends(verify_teacher_access)
):
    """
    Allows a teacher to manually override the AI's grading decision.
    Automatically handles State Machine Unlocking if the teacher forces a 'PASS'.
    """
    # 🚨 THE FIX (Issue 2): Strict Case Formatting for Enum Compatibility
    # Frontend sends "COMPLETED" or "NEEDS_REMEDIATION", our DB Enum expects "Completed" or "Needs Remediation"
    formatted_status = request.status.replace("_", " ").title() 
    
    try:
        new_status = TaskStatus(formatted_status)
    except ValueError:
        logger.error(f"Invalid Enum mapping attempt for value: {formatted_status}")
        raise HTTPException(
            status_code=400, 
            detail=f"Invalid status payload: {request.status}. Must map to a valid TaskStatus."
        )

    # 1. Find the target task with its roadmap relation loaded for the student ID
    task_stmt = select(Task).options(selectinload(Task.roadmap)).where(Task.id == task_id)
    task_result = await db.execute(task_stmt)
    task = task_result.scalar_one_or_none()

    if not task:
        raise HTTPException(status_code=404, detail="Task not found.")

    # 2. Apply override changes
    task.status = new_status
    if new_status == TaskStatus.COMPLETED:
        # Give full arbitrary marks on override to bypass minimum thresholds
        task.achieved_score = 100.0 

    # Log this administrative action in Progress table for auditing
    progress_log = Progress(
        student_id=task.roadmap.student_id, 
        task_id=task.id,
        status=GradingStatus.PASS if new_status == TaskStatus.COMPLETED else GradingStatus.FAIL,
        score=100.0 if new_status == TaskStatus.COMPLETED else 0.0,
        execution_logs=f"[INSTRUCTOR OVERRIDE]: {request.instructor_notes}"
    )
    db.add(progress_log)

    # 3. STATE MACHINE ENGINE: If forced to PASS, automatically unlock the dependent task
    if new_status == TaskStatus.COMPLETED:
        next_task_stmt = select(Task).where(Task.prerequisite_id == task.id)
        next_task_result = await db.execute(next_task_stmt)
        next_task = next_task_result.scalar_one_or_none()

        if next_task and next_task.status == TaskStatus.LOCKED:
            next_task.status = TaskStatus.PENDING

    await db.commit()
    logger.info(f"HITL Action: Instructor {teacher.id} forcefully set Task {task.id} to {new_status.value}.")

    return {"message": "Manual override applied successfully."}

# =======================================================================
# CSV Export
# =======================================================================
@router.get("/export-csv")
async def export_class_report(
    db: AsyncSession = Depends(get_db),
    teacher: User = Depends(verify_teacher_access)
):
    """
    Generates a real-time CSV report of class progress and streams it back to the client.
    """
    stmt = select(User).where(User.role == UserRole.STUDENT).options(
        selectinload(User.roadmaps).selectinload(Roadmap.tasks)
    )
    result = await db.execute(stmt)
    students = result.scalars().all()

    stream = io.StringIO()
    csv_writer = csv.writer(stream)
    
    csv_writer.writerow(["Student ID", "Email", "Target Domain", "Completion %", "Risk Status"])

    for student in students:
        active_roadmap = next((r for r in student.roadmaps if r.is_active), None)
        completion_percentage = 0.0
        is_at_risk = False
        domain = "N/A"
        
        if active_roadmap:
            domain = active_roadmap.content.get("target_domain", "Unknown")
            total_tasks = len(active_roadmap.tasks)
            if total_tasks > 0:
                completed_tasks = sum(1 for t in active_roadmap.tasks if t.status == TaskStatus.COMPLETED)
                failed_tasks = sum(1 for t in active_roadmap.tasks if t.status == TaskStatus.NEEDS_REMEDIATION)
                completion_percentage = (completed_tasks / total_tasks) * 100
                if failed_tasks >= 2 or (completion_percentage < 50.0 and total_tasks > 5):
                    is_at_risk = True

        csv_writer.writerow([
            str(student.id),
            student.email,
            domain,
            f"{round(completion_percentage, 2)}%",
            "AT RISK" if is_at_risk else "On Track"
        ])

    stream.seek(0)
    
    response = StreamingResponse(iter([stream.getvalue()]), media_type="text/csv")
    response.headers["Content-Disposition"] = "attachment; filename=class_analytics_report.csv"
    
    return response