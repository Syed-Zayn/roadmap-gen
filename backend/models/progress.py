import uuid
from datetime import datetime, timezone
from enum import Enum as PyEnum
from sqlalchemy import ForeignKey, DateTime, Enum, Float, Text, String, Boolean
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from db.session import Base

class GradingStatus(str, PyEnum):
    """
    Standardizes the result coming back from the Docker Auto-Grader or Quiz engine.
    """
    PASS = "Pass"
    FAIL = "Fail"
    PENDING = "Pending"  # Used while code is executing in the Celery worker

class SkillNodeState(str, PyEnum):
    """
    Represents the real-time state of a node in the 3D Skill Tree.
    """
    LOCKED = "Locked"
    UNLOCKED = "Unlocked"
    IN_PROGRESS = "In_Progress"
    COMPLETED = "Completed"

class Progress(Base):
    __tablename__ = "progress_records"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4, index=True)
    student_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    task_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("tasks.id", ondelete="CASCADE"), nullable=False, index=True)

    # Grading metrics
    score: Mapped[float] = mapped_column(Float, nullable=True)
    status: Mapped[GradingStatus] = mapped_column(Enum(GradingStatus), nullable=False, default=GradingStatus.PENDING)
    
    # Advanced metrics for security and debugging
    plagiarism_score: Mapped[float] = mapped_column(Float, nullable=True)
    execution_logs: Mapped[str] = mapped_column(Text, nullable=True)  # Captures raw stdout/stderr from Docker

    # Only tracking creation time here as progress logs are generally append-only records
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    
    # Relationships mapping back to core entities
    student = relationship("User", back_populates="progress_records")
    task = relationship("Task", back_populates="progress_records")


class SkillTreeTracking(Base):
    """
    Enterprise caching table to hold the state of the Skill Tree.
    Prevents heavy recursive graph queries on every dashboard load.
    """
    __tablename__ = "skill_tree_tracking"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4, index=True)
    student_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    
    # Using string identifiers for nodes to allow flexible roadmap generation
    node_identifier: Mapped[str] = mapped_column(String, nullable=False, index=True)
    state: Mapped[SkillNodeState] = mapped_column(Enum(SkillNodeState), nullable=False, default=SkillNodeState.LOCKED)
    
    # Coordinates for dynamic frontend positioning
    pos_x: Mapped[float] = mapped_column(Float, nullable=False, default=0.0)
    pos_y: Mapped[float] = mapped_column(Float, nullable=False, default=0.0)
    
    unlocked_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=True)
    completed_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=True)

    # Relationship back to user
    student = relationship("User")