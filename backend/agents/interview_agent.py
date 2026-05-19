import logging
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from sqlalchemy.orm import selectinload

from models.roadmap import Roadmap, TaskStatus

logger = logging.getLogger(__name__)

class InterviewAgent:
    """
    Stateful AI Agent responsible for orchestrating the Mock Interview context.
    It synthesizes the student's current progress into a dynamic system prompt
    for the OpenAI Realtime Voice model.
    """
    
    @staticmethod
    async def build_interview_context(student_id: str, db: AsyncSession) -> str:
        """
        Fetches the student's active roadmap and translates it into strict pedagogical 
        instructions for the real-time audio evaluator.
        """
        logger.info(f"Building interview context for student ID: {student_id}")
        
        # Fetch the active roadmap with tasks eagerly loaded to avoid N+1 query overhead
        stmt = (
            select(Roadmap)
            .options(selectinload(Roadmap.tasks))
            .where(Roadmap.student_id == student_id, Roadmap.is_active == True)
            .order_by(Roadmap.created_at.desc())
            .limit(1)
        )
        
        result = await db.execute(stmt)
        roadmap = result.scalars().first()
        
        # Fallback context if the student has no active curriculum
        if not roadmap:
            return (
                "You are an expert technical interviewer. The student does not have an active curriculum yet. "
                "Ask them general, fundamental computer science and logic questions to assess their baseline skills. "
                "Keep your responses concise, conversational, and evaluate their answers gently."
            )
            
        target_domain = roadmap.content.get("target_domain", "Software Engineering")
        
        # Analyze current progress to tailor the interview difficulty
        completed_tasks = [t.title for t in roadmap.tasks if t.status == TaskStatus.COMPLETED]
        pending_tasks = [t.title for t in roadmap.tasks if t.status != TaskStatus.COMPLETED]
        
        completed_str = ", ".join(completed_tasks) if completed_tasks else "None yet"
        
        # Construct the enterprise system prompt injecting the exact DB state
        instructions = (
            f"You are an elite, professional technical interviewer evaluating a student focusing on {target_domain}. "
            f"The student has recently studied the following topics: {completed_str}. "
            "Your objective is to conduct a mock interview based ONLY on what they have learned so far. "
            "Follow these strict rules:\n"
            "1. Ask exactly one technical question at a time and wait for their verbal response.\n"
            "2. Evaluate their answer instantly. If they are wrong, explain why briefly. If they are right, praise them and move to a slightly harder question.\n"
            "3. Maintain a natural, encouraging human-like conversation. Do not sound robotic.\n"
            "4. Keep your spoken responses under 30 seconds to ensure a fast-paced conversational flow."
        )
        
        return instructions

# Export a singleton instance of the agent
interview_agent = InterviewAgent()