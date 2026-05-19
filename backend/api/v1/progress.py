from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from sqlalchemy.orm import selectinload
from typing import List, Dict, Any

from db.session import get_db
from api.v1.auth import get_current_user
from models.user import User
from models.roadmap import Roadmap, Task, TaskStatus

router = APIRouter(prefix="/progress", tags=["Progress & Gamification"])

@router.get("/skill-tree", response_model=Dict[str, Any])
async def get_skill_tree_data(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    ENTERPRISE UPDATE: Fetches the dynamic Skill Tree Graph directly from the 
    single source of truth (Roadmap & Tasks tables). 
    Zero hardcoded values. 100% Real-time synchronization.
    """
    # 1. Fetch the active roadmap and its tasks eagerly
    stmt = (
        select(Roadmap)
        .options(selectinload(Roadmap.tasks))
        .where(Roadmap.student_id == current_user.id, Roadmap.is_active == True)
        .order_by(Roadmap.created_at.desc())
        .limit(1)
    )
    result = await db.execute(stmt)
    roadmap = result.scalar_one_or_none()

    if not roadmap or not roadmap.tasks:
        # Return graceful zero state if no active roadmap exists
        return {
            "nodes": [],
            "edges": [],
            "overall_progress": 0.0
        }

    # Sort tasks by creation time to mathematically sequence the graph
    tasks = sorted(roadmap.tasks, key=lambda t: t.created_at)

    nodes = []
    edges = []
    completed_count = 0
    total_tasks = len(tasks)

    for idx, task in enumerate(tasks):
        # Dynamic Zig-Zag Positioning for the UI Graph (100% scalable)
        x_pos = 100 + (idx * 200)
        y_pos = 120 if idx % 2 == 0 else 260

        # Map strictly from Backend TaskStatus to Frontend SkillNodeState
        node_state = "Locked"
        if task.status == TaskStatus.COMPLETED:
            node_state = "Completed"
            completed_count += 1
        elif task.status in [TaskStatus.IN_PROGRESS, TaskStatus.PENDING]:
            node_state = "In_Progress"
        elif task.status == TaskStatus.NEEDS_REMEDIATION:
            node_state = "In_Progress"  # Highlight remediation tasks as currently active targets

        nodes.append({
            "id": str(task.id),
            "title": task.title,
            "state": node_state,
            "x": x_pos,
            "y": y_pos
        })

        # Dynamic Edge Rendering (Link nodes based on prerequisites or sequential order)
        if task.prerequisite_id:
            prereq_task = next((t for t in tasks if t.id == task.prerequisite_id), None)
            is_active = False
            if prereq_task and prereq_task.status == TaskStatus.COMPLETED:
                is_active = True

            edges.append({
                "id": f"edge_{task.prerequisite_id}_{task.id}",
                "source": str(task.prerequisite_id),
                "target": str(task.id),
                "active": is_active
            })
        elif idx > 0:
            # Fallback sequential edge if no explicit prerequisite exists
            prev_task = tasks[idx - 1]
            is_active = prev_task.status == TaskStatus.COMPLETED
            edges.append({
                "id": f"edge_{prev_task.id}_{task.id}",
                "source": str(prev_task.id),
                "target": str(task.id),
                "active": is_active
            })

    # Exact mathematical percentage based on the database
    overall_progress = round((completed_count / total_tasks) * 100, 2) if total_tasks > 0 else 0.0

    return {
        "nodes": nodes,
        "edges": edges,
        "overall_progress": overall_progress
    }