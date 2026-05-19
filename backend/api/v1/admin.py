import uuid
import logging
from typing import List
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import func, select, cast, Float

from db.session import get_db
from models.user import User, UserRole
from models.roadmap import Roadmap
from models.progress import Progress, GradingStatus
from schemas.user_schema import AdminUserViewDetail
from api.v1.auth import get_current_user

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/admin", tags=["SuperAdmin Analytics & User Management"])

async def get_current_superadmin(current_user: User = Depends(get_current_user)) -> User:
    """
    Strict middleware dependency. Blocks any request not originating from a SuperAdmin.
    """
    if current_user.role != UserRole.SUPERADMIN:
        logger.warning(f"Unauthorized admin access attempt by User ID: {current_user.id}")
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Access denied. SuperAdmin privileges are required for this operation."
        )
    return current_user

@router.get("/analytics/dashboard")
async def get_platform_analytics(
    db: AsyncSession = Depends(get_db),
    admin_user: User = Depends(get_current_superadmin)
):
    """
    Fetches real-time, aggregated enterprise analytics directly from PostgreSQL.
    Avoids loading full objects into memory for maximum performance.
    """
    try:
        # 1. User Demographics
        total_users_query = await db.execute(select(func.count(User.id)))
        total_users = total_users_query.scalar() or 0

        students_query = await db.execute(select(func.count(User.id)).where(User.role == UserRole.STUDENT))
        total_students = students_query.scalar() or 0

        # 2. Roadmap Insights
        total_roadmaps_query = await db.execute(select(func.count(Roadmap.id)))
        total_roadmaps = total_roadmaps_query.scalar() or 0

        active_roadmaps_query = await db.execute(select(func.count(Roadmap.id)).where(Roadmap.is_active == True))
        active_roadmaps = active_roadmaps_query.scalar() or 0

        # 3. System Engagement & Pass Rates
        total_tasks_query = await db.execute(select(func.count(Progress.id)))
        total_tasks_attempted = total_tasks_query.scalar() or 0

        completed_tasks_query = await db.execute(
            select(func.count(Progress.id)).where(Progress.status == GradingStatus.PASS)
        )
        total_tasks_completed = completed_tasks_query.scalar() or 0

        # Calculate absolute pass rate safely (Avoiding Division by Zero)
        overall_pass_rate = 0.0
        if total_tasks_attempted > 0:
            overall_pass_rate = round((total_tasks_completed / total_tasks_attempted) * 100, 2)

        # 4. Compute / Token Analytics 
        compute_hours_query = await db.execute(select(func.sum(User.weekly_hours)))
        total_compute_hours_allocated = compute_hours_query.scalar() or 0

        logger.info(f"Admin Dashboard accessed by SuperAdmin: {admin_user.email}")

        return {
            "status": "success",
            "data": {
                "users": {
                    "total": total_users,
                    "students": total_students,
                    "teachers": total_users - total_students - 1 # Subtracting students and the current admin
                },
                "curriculums": {
                    "total_generated": total_roadmaps,
                    "currently_active": active_roadmaps
                },
                "engagement": {
                    "tasks_attempted": total_tasks_attempted,
                    "tasks_completed": total_tasks_completed,
                    "overall_pass_rate_percentage": overall_pass_rate
                },
                "platform_compute": {
                    "total_study_hours_allocated": total_compute_hours_allocated,
                    "ai_roadmap_ratio": round(total_roadmaps / total_users, 2) if total_users > 0 else 0
                }
            }
        }

    except Exception as e:
        logger.error(f"Failed to generate platform analytics: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="An error occurred while computing platform analytics."
        )

# =======================================================================
# NEW ENTERPRISE FEATURE: User Management System
# =======================================================================

@router.get("/users", response_model=List[AdminUserViewDetail])
async def get_all_users(
    db: AsyncSession = Depends(get_db),
    admin_user: User = Depends(get_current_superadmin)
):
    """
    Retrieves a complete list of all registered users (Students and Teachers)
    for the SuperAdmin user management data table.
    """
    try:
        # Fetch all users, ordered by newest registrations first
        stmt = select(User).order_by(User.created_at.desc())
        result = await db.execute(stmt)
        users = result.scalars().all()
        
        logger.info(f"SuperAdmin {admin_user.email} fetched the global user directory.")
        return users
    except Exception as e:
        logger.error(f"Failed to fetch users list: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="An error occurred while fetching the user directory."
        )

@router.delete("/users/{user_id}", status_code=status.HTTP_200_OK)
async def delete_user(
    user_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    admin_user: User = Depends(get_current_superadmin)
):
    """
    Permanently deletes a user from the system.
    Enterprise Logic: Due to SQLAlchemy cascade="all, delete-orphan", this will 
    also securely wipe their roadmaps, progress records, notes, and credentials.
    """
    try:
        # Enterprise Guardrail: Prevent the SuperAdmin from accidentally deleting their own account
        if user_id == admin_user.id:
            logger.warning(f"SuperAdmin {admin_user.email} attempted self-deletion.")
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Action denied: You cannot delete your own active SuperAdmin account."
            )

        # Locate the target user
        stmt = select(User).where(User.id == user_id)
        result = await db.execute(stmt)
        user_to_delete = result.scalar_one_or_none()

        if not user_to_delete:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="User not found in the database."
            )

        # Execute cascading deletion
        await db.delete(user_to_delete)
        await db.commit()

        logger.info(f"SuperAdmin {admin_user.email} permanently deleted user {user_to_delete.email} (ID: {user_id})")

        return {
            "status": "success", 
            "message": f"User {user_to_delete.email} and all associated data have been securely wiped."
        }

    except HTTPException:
        # Re-raise known HTTP exceptions (like 404 or 400) directly to the client
        raise
    except Exception as e:
        await db.rollback()
        logger.error(f"Database error while deleting user {user_id}: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="An error occurred while attempting to delete the user. Please try again."
        )