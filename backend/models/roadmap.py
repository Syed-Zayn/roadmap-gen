import uuid
from datetime import datetime, timezone
from enum import Enum as PyEnum
from sqlalchemy import String, ForeignKey, DateTime, Enum, Text, Boolean, Integer, Float
from sqlalchemy.dialects.postgresql import UUID, JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from db.session import Base

class TaskType(str, PyEnum):
    """
    Categorizes the learning material to render the correct UI component on the frontend.
    """
    RESOURCE = "Resource"  # Videos or Articles
    QUIZ = "Quiz"          # Multiple choice assessment
    CODING = "Coding"      # Docker sandboxed execution task

class TaskStatus(str, PyEnum):
    """
    Follows the exact State Machine Diagram provided in the system architecture.
    """
    LOCKED = "Locked"
    PENDING = "Pending"  # Unlocked but not started
    IN_PROGRESS = "In Progress"
    COMPLETED = "Completed"
    NEEDS_REMEDIATION = "Needs Remediation"

class Roadmap(Base):
    __tablename__ = "roadmaps"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4, index=True)
    student_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    
    # JSONB is strictly used here for high-performance querying of the AI output structure
    content: Mapped[dict] = mapped_column(JSONB, nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), 
        default=lambda: datetime.now(timezone.utc), 
        onupdate=lambda: datetime.now(timezone.utc)
    )

    student = relationship("User", back_populates="roadmaps")
    tasks = relationship("Task", back_populates="roadmap", cascade="all, delete-orphan", foreign_keys="[Task.roadmap_id]")


class Task(Base):
    __tablename__ = "tasks"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4, index=True)
    roadmap_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("roadmaps.id", ondelete="CASCADE"), nullable=False, index=True)
    
    # Core Task Details
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[str] = mapped_column(Text, nullable=True)
    task_type: Mapped[TaskType] = mapped_column(Enum(TaskType), nullable=False)
    status: Mapped[TaskStatus] = mapped_column(Enum(TaskStatus), nullable=False, default=TaskStatus.LOCKED)

    # -------------------------------------------------------------------
    # State Machine & Prerequisite Logic (For Step-by-Step Unlocking)
    # -------------------------------------------------------------------
    # Self-referential foreign key. If a task has a prerequisite, it remains LOCKED until the prerequisite is COMPLETED.
    prerequisite_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("tasks.id", ondelete="SET NULL"), nullable=True)

    # -------------------------------------------------------------------
    # Assessment & Remediation Tracking (For Quizzes and Auto-Grader)
    # -------------------------------------------------------------------
    minimum_passing_score: Mapped[float] = mapped_column(Float, nullable=True)  # e.g., 70.0% to pass
    achieved_score: Mapped[float] = mapped_column(Float, nullable=True)         # Last recorded score
    remediation_attempts: Mapped[int] = mapped_column(Integer, default=0, nullable=False) # Tracks failures to trigger adaptive lessons
    
    # 🚨 THE FIX: Added last_submission to securely store raw code or stringified JSON quiz answers
    last_submission: Mapped[str] = mapped_column(Text, nullable=True)

    # Audit Timestamps
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), 
        default=lambda: datetime.now(timezone.utc), 
        onupdate=lambda: datetime.now(timezone.utc)
    )

    # Relationships mapping back to core entities
    roadmap = relationship("Roadmap", back_populates="tasks")
    progress_records = relationship("Progress", back_populates="task", cascade="all, delete-orphan")
    
    # Relationship to fetch the prerequisite task and its dependents natively
    prerequisite = relationship("Task", remote_side=[id], backref="dependents")