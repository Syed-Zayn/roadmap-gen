import asyncio
import logging
from sqlalchemy.future import select
from sqlalchemy import update

from worker.celery_app import celery_app
from worker.docker_runner import execute_sandboxed_code
from worker.plagiarism import evaluate_code_similarity

from db.session import AsyncSessionLocal


import models.user 
import models.roadmap
import models.progress

from models.progress import Progress, GradingStatus
from models.roadmap import Task, TaskStatus

logger = logging.getLogger(__name__)

async def _process_and_grade_async(progress_id: str, source_code: str, student_id: str):
    """
    Internal async function to handle database queries, plagiarism checks, 
    and Docker sandboxing since Celery tasks operate synchronously.
    """
    async with AsyncSessionLocal() as db:
        try:
            # 1. Fetch the progress record and associated task to get required test cases
            stmt = select(Progress, Task).join(Task).where(Progress.id == progress_id)
            result = await db.execute(stmt)
            row = result.first()
            
            if not row:
                logger.error(f"Progress record {progress_id} not found in DB.")
                return
                
            progress_record, task_record = row
            
            # In a full deployment, test_cases would be stored in the Task model or a related table.
            test_cases = "" 
            
            # 2. Run Plagiarism Check Asynchronously
            plagiarism_score = await evaluate_code_similarity(source_code, student_id, db)
            
            # 3. Execute the code in the Docker Sandbox (Synchronous blocking call)
            # Since docker python sdk is sync, we run it directly here
            is_pass, execution_logs = execute_sandboxed_code(source_code, test_cases)
            
            # 4. Calculate Final Status
            # If plagiarism is > 80%, instantly fail the student
            if plagiarism_score and plagiarism_score >= 80.0:
                is_pass = False
                execution_logs += "\n\n[SYSTEM ALERT]: High probability of plagiarism detected. Submission failed."

            final_status = GradingStatus.PASS if is_pass else GradingStatus.FAIL
            
            # 5. Update Progress Record
            await db.execute(
                update(Progress)
                .where(Progress.id == progress_id)
                .values(
                    status=final_status,
                    plagiarism_score=plagiarism_score,
                    execution_logs=execution_logs
                )
            )
            
            # 6. Update Task Status & Trigger State Machine Unlocks
            if final_status == GradingStatus.PASS:
                await db.execute(
                    update(Task)
                    .where(Task.id == task_record.id)
                    .values(status=TaskStatus.COMPLETED)
                )
                
                # Unlock Next Task
                await db.execute(
                    update(Task)
                    .where(Task.prerequisite_id == task_record.id)
                    .where(Task.status == TaskStatus.LOCKED)
                    .values(status=TaskStatus.PENDING)
                )
            else:
                await db.execute(
                    update(Task)
                    .where(Task.id == task_record.id)
                    .values(
                        status=TaskStatus.NEEDS_REMEDIATION,
                        remediation_attempts=Task.remediation_attempts + 1
                    )
                )
                
            await db.commit()
            logger.info(f"Successfully graded Progress ID for {progress_id}. Status: {final_status.value}")

        except Exception as e:
            await db.rollback()
            logger.error(f"Database error during async grading update: {str(e)}")
            
            # Emergency fallback: Mark progress as failed if the database transaction crashes
            await db.execute(
                update(Progress)
                .where(Progress.id == progress_id)
                .values(
                    status=GradingStatus.FAIL,
                    execution_logs=f"Internal Server Error during grading pipeline: {str(e)}"
                )
            )
            await db.commit()

@celery_app.task(bind=True, max_retries=3, name="tasks.grade_code_submission")
def grade_code_submission(self, progress_id: str, source_code: str, student_id: str):
    """
    The Celery Task entry point. Picked up from the Redis queue.
    Wraps the asynchronous grading logic within an asyncio event loop.
    """
    logger.info(f"Worker picked up grading task for Progress ID: {progress_id}")
    
    try:
        # Execute the async DB and Docker logic inside the sync Celery thread
        asyncio.run(_process_and_grade_async(progress_id, source_code, student_id))
    except Exception as exc:
        logger.error(f"Task failed, attempting retry. Error: {str(exc)}")
        # Exponential backoff retry in case of temporary Redis/DB lock
        raise self.retry(exc=exc, countdown=2 ** self.request.retries)