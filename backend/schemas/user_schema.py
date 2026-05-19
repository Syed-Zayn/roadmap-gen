import uuid
from datetime import datetime
from typing import Optional
from pydantic import BaseModel, EmailStr, Field, ConfigDict

# Importing the Enum from our database models to ensure strict consistency
from models.user import UserRole

class UserBase(BaseModel):
    """
    Shared properties for user input and output.
    Uses EmailStr to automatically validate email formats via email-validator.
    """
    email: EmailStr = Field(..., description="Valid email address for the user")
    role: UserRole = Field(default=UserRole.STUDENT, description="System role assignment")

class UserCreate(UserBase):
    """
    Schema used strictly for the registration/signup endpoint.
    Enforces password complexity rules before hitting the database.
    """
    password: str = Field(..., min_length=8, description="Password must be at least 8 characters long")

class UserUpdate(BaseModel):
    """
    Schema for updating student profile preferences, such as their available study hours.
    """
    weekly_hours: Optional[int] = Field(
        None, 
        ge=1, 
        le=168, 
        description="Available study hours per week (must be between 1 and 168)"
    )

class UserResponse(UserBase):
    """
    Schema used for returning user data to the frontend.
    The hashed_password field is intentionally omitted here for security.
    """
    id: uuid.UUID
    weekly_hours: Optional[int] = None
    created_at: datetime
    updated_at: datetime

    # ConfigDict(from_attributes=True) enables seamless mapping from SQLAlchemy ORM models to Pydantic
    model_config = ConfigDict(from_attributes=True)

class AdminUserViewDetail(UserResponse):
    """
    Extended schema for the SuperAdmin User Management Dashboard.
    Inherits all safe properties from UserResponse. This distinct schema allows us to 
    add future administrative fields (e.g., active penalties, total roadmaps) without 
    exposing them to regular users.
    """
    pass