import json
import logging
from typing import List
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from sqlalchemy import update
from langchain_openai import ChatOpenAI
from langchain_core.prompts import ChatPromptTemplate

from core.config import settings
from db.session import get_db
from models.user import User
from models.roadmap import Task, TaskStatus, TaskType
from models.progress import Progress, GradingStatus
from api.v1.auth import get_current_user

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/quiz", tags=["Weekly Quizzes"])

# =======================================================================
# Pydantic Validation Schemas
# =======================================================================
class QuizOption(BaseModel):
    id: str = Field(..., description="Option identifier (e.g., A, B, C, D)")
    text: str = Field(..., description="The multiple choice option text")

class QuizQuestion(BaseModel):
    id: str = Field(..., description="Unique question identifier")
    question_text: str = Field(..., description="The main question")
    options: List[QuizOption] = Field(..., description="List of 4 possible answers")
    correct_option_id: str = Field(..., description="The ID of the correct option")

class QuizGenerationResponse(BaseModel):
    questions: List[QuizQuestion] = Field(..., description="A set of exactly 5 questions for the task")

class AnswerSubmission(BaseModel):
    question_id: str
    selected_option_id: str

class QuizSubmitRequest(BaseModel):
    questions: List[QuizQuestion]
    answers: List[AnswerSubmission]

class QuizSubmitResponse(BaseModel):
    score_percentage: float
    passed: bool
    status: str
    feedback: str

# =======================================================================
# API Endpoints
# =======================================================================
@router.post("/generate/{task_id}", response_model=QuizGenerationResponse)
async def generate_task_quiz(
    task_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Dynamically generates a targeted quiz for a specific roadmap task using LangChain.
    Ensures the task is unlocked before generation.
    """
    # 1. Verify task existence and state machine constraints
    result = await db.execute(select(Task).where(Task.id == task_id))
    task = result.scalar_one_or_none()

    if not task:
        raise HTTPException(status_code=404, detail="Task not found.")
    
    if task.task_type != TaskType.QUIZ:
        raise HTTPException(status_code=400, detail="This task is not a quiz assessment.")

    if task.status == TaskStatus.LOCKED:
        raise HTTPException(status_code=403, detail="Complete prerequisite tasks to unlock this quiz.")

    logger.info(f"Generating Quiz for Task {task_id} (Topic: {task.title})")

    # 2. Trigger OpenAI to generate strictly formatted questions based on the task title
    try:
        llm = ChatOpenAI(
            api_key=settings.OPENAI_API_KEY,
            model="gpt-4o-mini",
            temperature=0.2 # Low temperature for factual accuracy
        )
        
        structured_llm = llm.with_structured_output(QuizGenerationResponse)
        
        prompt = ChatPromptTemplate.from_messages([
            ("system", "You are an expert academic examiner. Generate exactly 5 challenging multiple choice questions "
                       "focused entirely on the provided topic. Each question must have exactly 4 options. "
                       "Return the output in the strict requested JSON format."),
            ("human", "Topic to assess: {topic}\nTask Description: {description}")
        ])
        
        chain = prompt | structured_llm
        quiz_data: QuizGenerationResponse = chain.invoke({
            "topic": task.title,
            "description": task.description or "General concepts"
        })
        
        return quiz_data
        
    except Exception as e:
        logger.error(f"Failed to generate quiz via LLM: {str(e)}")
        raise HTTPException(status_code=500, detail="Failed to generate the quiz. AI engine error.")


@router.post("/submit/{task_id}", response_model=QuizSubmitResponse)
async def submit_task_quiz(
    task_id: str,
    payload: QuizSubmitRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Evaluates the quiz submission. 
    Updates the State Machine: Unlocks next task if passed, or triggers Remediation if failed.
    Saves the exact student submission for the Teacher HITL View.
    """
    # 1. Validate Task
    result = await db.execute(select(Task).where(Task.id == task_id))
    task = result.scalar_one_or_none()

    if not task:
        raise HTTPException(status_code=404, detail="Task not found.")

    # 2. Evaluate Score
    correct_answers = 0
    total_questions = len(payload.questions)
    if total_questions == 0:
        raise HTTPException(status_code=400, detail="Invalid submission. No questions found.")

    correct_map = {q.id: q.correct_option_id for q in payload.questions}
    
    # 🚨 THE FIX (Issue 5): Build a detailed submission log for the Teacher Dashboard
    detailed_submission_log = []

    for ans in payload.answers:
        # Check correctness
        is_correct = False
        if ans.question_id in correct_map and ans.selected_option_id == correct_map[ans.question_id]:
            correct_answers += 1
            is_correct = True
            
        # Find the question text and selected option text for the log
        q_data = next((q for q in payload.questions if q.id == ans.question_id), None)
        if q_data:
            selected_opt_text = next((opt.text for opt in q_data.options if opt.id == ans.selected_option_id), "Unknown")
            detailed_submission_log.append({
                "question": q_data.question_text,
                "student_answer": selected_opt_text,
                "is_correct": is_correct
            })
            
    score_percentage = (correct_answers / total_questions) * 100
    
    # Convert the detailed log to a JSON string so it can be saved in the database
    submission_json_string = json.dumps(detailed_submission_log)

    # Use DB threshold or default to 70%
    passing_threshold = task.minimum_passing_score if task.minimum_passing_score else 70.0
    is_pass = score_percentage >= passing_threshold

    # 3. Handle Database Transactions (State Machine Update)
    try:
        # Record the evaluation in the Progress table
        progress_record = Progress(
            student_id=current_user.id,
            task_id=task.id,
            score=score_percentage,
            status=GradingStatus.PASS if is_pass else GradingStatus.FAIL,
            execution_logs=f"Quiz submitted. Correct answers: {correct_answers}/{total_questions}"
        )
        db.add(progress_record)

        if is_pass:
            # Update Current Task to COMPLETED and save the last_submission payload
            await db.execute(
                update(Task)
                .where(Task.id == task.id)
                .values(
                    status=TaskStatus.COMPLETED, 
                    achieved_score=score_percentage,
                    last_submission=submission_json_string
                )
            )
            
            # AUTOMATIC UNLOCK: Find and unlock the dependent task
            await db.execute(
                update(Task)
                .where(Task.prerequisite_id == task.id)
                .where(Task.status == TaskStatus.LOCKED)
                .values(status=TaskStatus.PENDING)
            )
            
            final_status = "Completed"
            feedback = "Congratulations! You passed the quiz. The next module is now unlocked."
            logger.info(f"Task {task.id} marked COMPLETED. Next task unlocked.")
        else:
            # TRIGGER REMEDIATION: Flag for micro-lessons and save the failed submission
            await db.execute(
                update(Task)
                .where(Task.id == task.id)
                .values(
                    status=TaskStatus.NEEDS_REMEDIATION, 
                    achieved_score=score_percentage,
                    remediation_attempts=Task.remediation_attempts + 1,
                    last_submission=submission_json_string
                )
            )
            
            final_status = "Needs Remediation"
            feedback = "You did not meet the passing criteria. Adaptive remediation lessons will be generated to help you."
            logger.warning(f"Task {task.id} marked NEEDS_REMEDIATION. Score: {score_percentage}%")

        await db.commit()

        return QuizSubmitResponse(
            score_percentage=score_percentage,
            passed=is_pass,
            status=final_status,
            feedback=feedback
        )

    except Exception as e:
        await db.rollback()
        logger.error(f"Database error during quiz evaluation: {str(e)}")
        raise HTTPException(status_code=500, detail="Internal server error while saving progress.")