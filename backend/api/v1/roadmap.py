import json
import logging
import asyncio
from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.responses import StreamingResponse
from fastapi.encoders import jsonable_encoder
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from sqlalchemy import update
from sqlalchemy.orm import selectinload

from db.session import get_db
from models.user import User
from models.roadmap import Roadmap, Task, TaskStatus, TaskType
from schemas.roadmap_schema import RoadmapGenerateRequest, RoadmapResponse
from api.v1.auth import get_current_user
from agents.graph import agent_executor

# Configure enterprise-grade logging for tracking roadmap lifecycle and SSE streams
logger = logging.getLogger(__name__)
router = APIRouter(prefix="/roadmap", tags=["Curriculum Engine"])

@router.post("/generate", status_code=status.HTTP_201_CREATED)
async def generate_adaptive_roadmap(
    request: RoadmapGenerateRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Triggers the LangGraph multi-agent system to design, review, and curate a customized
    learning roadmap.
    
    [ENTERPRISE OPTIMIZATION - PHASE 1]: 
    Upgraded to Server-Sent Events (SSE). Streams real-time execution steps from LangGraph 
    directly to the Next.js frontend to achieve zero perceived latency.
    """
    logger.info(f"User {current_user.id} requested a roadmap stream for '{request.target_domain}'")

    # Initial state configuration for the LangGraph AI Engine
    initial_state = {
        "target_domain": request.target_domain,
        "weekly_hours": request.weekly_hours,
        "skill_level": request.skill_level,
        "messages": [],
        "reviewer_feedback": [],
        "errors": [],
        "revision_count": 0
    }

    async def sse_generator():
        """
        Asynchronous generator function that yields real-time JSON updates to the frontend.
        """
        try:
            # Step 1: Acknowledge request instantly
            yield f"data: {json.dumps({'status': 'processing', 'message': f'Initializing AI Architects for {request.target_domain}...'})}\n\n"
            
            roadmap_content = None
            has_errors = False
            
            # Step 2: Stream LangGraph node executions dynamically
            # astream() yields state updates as each node (architect, reviewer, curator) completes
            async for event in agent_executor.astream(initial_state):
                for node_name, state_update in event.items():
                    
                    # Capture errors if any agent fails
                    if "errors" in state_update and state_update["errors"]:
                        has_errors = True
                        error_detail = state_update["errors"][0]
                        logger.error(f"Agent Engine Error at {node_name}: {error_detail}")
                        yield f"data: {json.dumps({'status': 'error', 'message': 'AI Engine encountered a critical error during generation.'})}\n\n"
                        return # Terminate stream safely

                    # Capture the final AI-generated content once the Curator completes
                    if "final_roadmap" in state_update and state_update["final_roadmap"]:
                        roadmap_content = state_update["final_roadmap"]

                    # Map internal LangGraph node names to user-friendly frontend messages
                    if node_name == "architect":
                        msg = "Drafting optimal week-by-week curriculum structure..."
                    elif node_name == "reviewer":
                        msg = "Reviewing curriculum against your constraints..."
                    elif node_name == "curator":
                        msg = "Curating high-quality resources (YouTube Videos & Pinecone Docs)..."
                    elif node_name == "remediator":
                        msg = "Adjusting curriculum based on AI pedagogical review..."
                    else:
                        msg = f"Processing stage: {node_name}..."
                        
                    yield f"data: {json.dumps({'status': 'processing', 'message': msg})}\n\n"
                    
                    # Prevent event loop blocking and allow TCP buffers to flush
                    await asyncio.sleep(0.1)

            # Safety Guard: Ensure roadmap was actually generated
            if not roadmap_content and not has_errors:
                yield f"data: {json.dumps({'status': 'error', 'message': 'AI Engine returned an empty curriculum.'})}\n\n"
                return

            yield f"data: {json.dumps({'status': 'processing', 'message': 'Finalizing curriculum and provisioning database records...'})}\n\n"

            # Step 3: Database Transactions (Deactivate old, insert new)
            deactivate_stmt = (
                update(Roadmap)
                .where(Roadmap.student_id == current_user.id)
                .where(Roadmap.is_active == True)
                .values(is_active=False)
            )
            await db.execute(deactivate_stmt)
            await db.flush()

            new_roadmap = Roadmap(
                student_id=current_user.id,
                content=roadmap_content,
                is_active=True
            )
            db.add(new_roadmap)
            await db.flush() # Flush to generate PostgreSQL UUID

            # Step 4: Sequential Task Mapping & Linking (State Machine Implementation)
            is_first_task = True
            previous_task = None

            for milestone in roadmap_content.get("milestones", []):
                for ai_task in milestone.get("tasks", []):
                    
                    # Robust TaskType validation fallback
                    try:
                        t_type = TaskType(ai_task.get("task_type"))
                    except ValueError:
                        t_type = TaskType.RESOURCE

                    # Enforce the State Machine: First task is PENDING, rest are strictly LOCKED
                    current_task_status = TaskStatus.PENDING if is_first_task else TaskStatus.LOCKED
                    is_first_task = False 

                    new_task = Task(
                        roadmap_id=new_roadmap.id,
                        title=ai_task.get("title", "Untitled Task"),
                        description=ai_task.get("description", ""),
                        task_type=t_type,
                        status=current_task_status
                    )
                    db.add(new_task)
                    await db.flush()
                    
                    # Link sequential dependency chain
                    if previous_task:
                        new_task.prerequisite_id = previous_task.id
                    
                    previous_task = new_task
                    
            await db.commit()
            await db.refresh(new_roadmap)
            
            # Step 5: Eager load complete roadmap for the standard API response format
            stmt = (
                select(Roadmap)
                .options(selectinload(Roadmap.tasks))
                .where(Roadmap.id == new_roadmap.id)
            )
            result = await db.execute(stmt)
            saved_roadmap = result.scalar_one()

            # Encode SQLAlchemy object to Pydantic-validated JSON-safe dictionary
            response_data = RoadmapResponse.model_validate(saved_roadmap)
            encoded_data = jsonable_encoder(response_data)
            
            # Final yield: Send the complete payload to the client
            yield f"data: {json.dumps({'status': 'complete', 'roadmap': encoded_data})}\n\n"

        except Exception as e:
            # Catch unexpected crashes, rollback DB to prevent corruption, and notify frontend
            await db.rollback()
            logger.error(f"SSE Roadmap generation completely failed: {str(e)}")
            yield f"data: {json.dumps({'status': 'error', 'message': 'An internal error occurred while building the curriculum. Please try again.'})}\n\n"

    # Return the generator wrapped in a standard ASGI StreamingResponse
    return StreamingResponse(sse_generator(), media_type="text/event-stream")


@router.get("/get-my-roadmap", response_model=RoadmapResponse)
async def get_my_roadmap(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Retrieves the most recent, currently active roadmap for the authenticated student.
    Highly optimized query using limits and eager loading to reduce dashboard loading times.
    """
    stmt = (
        select(Roadmap)
        .options(selectinload(Roadmap.tasks).selectinload(Task.prerequisite)) # Load prerequisites dynamically
        .where(
            Roadmap.student_id == current_user.id,
            Roadmap.is_active == True
        )
        .order_by(Roadmap.created_at.desc())
        .limit(1) 
    )
    
    result = await db.execute(stmt)
    roadmap = result.scalars().first()

    if not roadmap:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, 
            detail="No active roadmap found for this user."
        )

    return roadmap