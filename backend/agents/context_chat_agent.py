import logging
from typing import List, Dict, Tuple, Optional
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from sqlalchemy.orm import selectinload

# Multi-LLM Wrappers
from langchain_openai import ChatOpenAI, OpenAIEmbeddings
from langchain_google_genai import ChatGoogleGenerativeAI
from langchain_anthropic import ChatAnthropic

from langchain_core.prompts import ChatPromptTemplate, MessagesPlaceholder
from langchain_core.messages import HumanMessage, AIMessage, BaseMessage

from langchain.agents import AgentExecutor, create_tool_calling_agent
from langchain_core.tools import StructuredTool
from pydantic import BaseModel, Field

from core.config import settings
from db.pinecone import vector_store
from models.user import User, UserRole
from models.roadmap import Roadmap, TaskStatus
from models.progress import Progress

# Configure logging for the Agent
logger = logging.getLogger(__name__)

# =======================================================================
# Enterprise Memory Store (In-Memory for demonstration/fast retrieval)
# =======================================================================
CHAT_MEMORY: Dict[str, List[BaseMessage]] = {}
MAX_HISTORY_LENGTH = 10

class ContextChatAgent:
    
    # =======================================================================
    # Internal Enterprise Helpers for RAG
    # =======================================================================
    async def _fetch_relevant_notes(self, user_id: str, query: str) -> str:
        """
        Directly queries Pinecone for the user's private notes based on the prompt.
        Used for strict pre-retrieval prompt injection (Forced RAG).
        """
        try:
            embeddings = OpenAIEmbeddings(
                api_key=settings.OPENAI_API_KEY, 
                model="text-embedding-3-small"
            )
            query_vector = await embeddings.aembed_query(query)
            
            # ENTERPRISE FIX: Fetch strictly from the user's isolated namespace
            results = await vector_store.aquery_user_documents(
                user_id=user_id, 
                query_vector=query_vector, 
                top_k=3
            )
            
            contexts = []
            for match in results.get("matches", []):
                metadata = match.get("metadata", {})
                title = metadata.get("title", "Untitled")
                text = metadata.get("text", "")
                score = match.get("score", 0.0)
                
                # Only inject notes that have a reasonable semantic match
                if text and score >= 0.2: 
                    contexts.append(f"--- Note: {title} ---\n{text}")
            
            return "\n\n".join(contexts)
        except Exception as e:
            logger.error(f"Pinecone Pre-Retrieval Error: {str(e)}")
            return ""

    # =======================================================================
    # Dynamic LangChain Tools (SQL Connectors + Vector DB)
    # =======================================================================
    def _build_student_tools(self, db: AsyncSession, user_id: str) -> List[StructuredTool]:
        """
        Generates dynamic tools that allow the AI to securely query ONLY the 
        currently authenticated student's SQL data AND Private Pinecone Notes.
        """
        async def fetch_my_progress() -> str:
            """Tool: Fetches the student's current learning path, tasks, and completion status."""
            try:
                stmt = select(Roadmap).options(selectinload(Roadmap.tasks)).where(
                    Roadmap.student_id == user_id, Roadmap.is_active == True
                )
                result = await db.execute(stmt)
                roadmap = result.scalar_one_or_none()
                
                if not roadmap:
                    return "You currently do not have an active learning roadmap. Please generate one from your dashboard."
                
                domain = roadmap.content.get("target_domain", "Unknown")
                total_tasks = len(roadmap.tasks)
                completed = sum(1 for t in roadmap.tasks if t.status == TaskStatus.COMPLETED)
                failed = sum(1 for t in roadmap.tasks if t.status == TaskStatus.NEEDS_REMEDIATION)
                
                return f"Target Domain: {domain}. Progress: {completed}/{total_tasks} tasks completed. Tasks needing remediation: {failed}."
            except Exception as e:
                logger.error(f"Tool Error (fetch_my_progress): {str(e)}")
                return "Database error while fetching progress."

        async def fetch_my_recent_feedback() -> str:
            """Tool: Fetches the AI feedback from the student's most recently evaluated tasks."""
            try:
                stmt = select(Progress).where(Progress.student_id == user_id).order_by(Progress.created_at.desc()).limit(3)
                result = await db.execute(stmt)
                logs = result.scalars().all()
                
                if not logs:
                    return "You have not submitted any coding tasks or quizzes yet."
                
                feedback_str = "\n".join([f"Score: {log.score}%, Feedback: {log.execution_logs}" for log in logs])
                return f"Here is the feedback on your recent submissions:\n{feedback_str}"
            except Exception as e:
                logger.error(f"Tool Error (fetch_my_recent_feedback): {str(e)}")
                return "Database error while fetching feedback."

        # ENTERPRISE FIX: Private RAG Knowledge Base Search Tool (Namespace Aware)
        async def search_my_private_notes(query: str) -> str:
            """Tool: Searches the student's personal private notes in the Pinecone vector database."""
            notes = await self._fetch_relevant_notes(user_id, query)
            return notes if notes else "I couldn't find any relevant information in your private notes."

        # Wrap async functions into LangChain StructuredTools
        return [
            StructuredTool.from_function(
                coroutine=fetch_my_progress,
                name="get_my_current_progress",
                description="ALWAYS use this tool when the user asks about their progress, roadmap, or how many tasks they have completed."
            ),
            StructuredTool.from_function(
                coroutine=fetch_my_recent_feedback,
                name="get_my_recent_feedback",
                description="ALWAYS use this tool when the user asks about what they did wrong, their recent mistakes, or AI feedback on their code."
            ),
            StructuredTool.from_function(
                coroutine=search_my_private_notes,
                name="search_my_private_notes",
                description="ALWAYS use this tool when the user asks about their personal notes, specific concepts they saved, or information from their custom knowledge base."
            )
        ]

    def _build_teacher_tools(self, db: AsyncSession) -> List[StructuredTool]:
        """
        Generates tools granting the instructor elevated access to query the entire class.
        """
        async def fetch_at_risk_students() -> str:
            try:
                stmt = select(User).where(User.role == UserRole.STUDENT).options(
                    selectinload(User.roadmaps).selectinload(Roadmap.tasks)
                )
                result = await db.execute(stmt)
                students = result.scalars().all()
                
                at_risk = []
                for student in students:
                    active_roadmap = next((r for r in student.roadmaps if r.is_active), None)
                    if active_roadmap:
                        failed_tasks = sum(1 for t in active_roadmap.tasks if t.status == TaskStatus.NEEDS_REMEDIATION)
                        if failed_tasks >= 2:
                            at_risk.append(f"Email: {student.email}, Failed Tasks: {failed_tasks}")
                
                if not at_risk:
                    return "Great news! No students are currently flagged as at-risk."
                return "At-Risk Students:\n" + "\n".join(at_risk)
            except Exception as e:
                logger.error(f"Tool Error (fetch_at_risk_students): {str(e)}")
                return "Database error while fetching class data."

        class StudentLookupInput(BaseModel):
            email: str = Field(..., description="The email address of the student to look up.")

        async def lookup_student_by_email(email: str) -> str:
            try:
                stmt = select(User).where(User.email == email, User.role == UserRole.STUDENT).options(
                    selectinload(User.roadmaps).selectinload(Roadmap.tasks)
                )
                result = await db.execute(stmt)
                student = result.scalar_one_or_none()
                
                if not student:
                    return f"No student found with email {email}."
                
                active_roadmap = next((r for r in student.roadmaps if r.is_active), None)
                if not active_roadmap:
                    return f"Student {email} is registered but has no active roadmap."
                
                domain = active_roadmap.content.get("target_domain", "Unknown")
                total = len(active_roadmap.tasks)
                completed = sum(1 for t in active_roadmap.tasks if t.status == TaskStatus.COMPLETED)
                score_sum = sum(t.achieved_score for t in active_roadmap.tasks if t.achieved_score is not None)
                scored_tasks = sum(1 for t in active_roadmap.tasks if t.achieved_score is not None)
                
                avg_score = round(score_sum / scored_tasks, 2) if scored_tasks > 0 else 0
                return f"Student: {email} | Domain: {domain} | Progress: {completed}/{total} | Average Score: {avg_score}%"
            except Exception as e:
                logger.error(f"Tool Error (lookup_student_by_email): {str(e)}")
                return "Database error while looking up student."

        return [
            StructuredTool.from_function(
                coroutine=fetch_at_risk_students,
                name="get_at_risk_students",
                description="Use this tool when the instructor asks who is failing, struggling, or at risk in the class."
            ),
            StructuredTool.from_function(
                coroutine=lookup_student_by_email,
                name="lookup_student_details",
                description="Use this tool to get specific details, progress, and scores for a student given their email.",
                args_schema=StudentLookupInput
            )
        ]

    # =======================================================================
    # Core Processing Engine (Multi-LLM Enabled & Pre-Retrieval RAG)
    # =======================================================================
    async def aprocess_message(
        self, query: str, user_id: str, user_role: str, session_id: str, db: AsyncSession, selected_model: Optional[str] = None
    ) -> Tuple[str, List[str], str]:
        """
        Constructs the Agent per request, mounts DB tools, explicitly injects Private Notes 
        (Pre-Retrieval RAG), maintains memory, and executes the LLM.
        """
        # 1. Multi-LLM Dynamic Router
        used_model_name = "OpenAI GPT-4o" 
        
        if selected_model:
            model_str = selected_model.lower()
            if "claude" in model_str:
                llm = ChatAnthropic(api_key=settings.ANTHROPIC_API_KEY, model=selected_model, temperature=0.2)
                used_model_name = "Claude 3.5 Sonnet"
            elif "gemini" in model_str:
                llm = ChatGoogleGenerativeAI(api_key=settings.GEMINI_API_KEY, model=selected_model, temperature=0.2)
                used_model_name = "Google Gemini"
            else:
                llm = ChatOpenAI(api_key=settings.OPENAI_API_KEY, model=selected_model, temperature=0.2)
        else:
            llm = ChatOpenAI(api_key=settings.OPENAI_API_KEY, model="gpt-4o-mini", temperature=0.2)

        # 2. Mount Role-Based Tools & ENTERPRISE RAG INJECTION
        if user_role.upper() == "TEACHER":
            tools = self._build_teacher_tools(db)
            system_prompt_text = (
                "You are an elite Instructor Assistant AI. You help teachers monitor their class. "
                "You have tools to fetch real-time SQL data. Always use your tools if asked about student data."
            )
        else:
            # STUDENT ROLE: Mount both SQL tools and Private Note tools
            tools = self._build_student_tools(db, user_id)
            
            logger.info(f"Executing Pre-Retrieval RAG for User {user_id}")
            injected_notes = await self._fetch_relevant_notes(user_id, query)
            
            rag_context = ""
            if injected_notes:
                rag_context = (
                    "\n\n--- PRIVATE KNOWLEDGE BASE (RAG CONTEXT) ---\n"
                    "The user has saved the following private notes. If these notes contain the answer, "
                    "you MUST use them to construct your response, ensuring the user's custom context is prioritized.\n\n"
                    f"{injected_notes}\n"
                    "----------------------------------------------\n"
                )

            system_prompt_text = (
                "You are an elite Adaptive Learning AI Mentor. You help students understand concepts "
                "and track their progress. "
                f"{rag_context}"
                "You also have access to SQL tools to check their progress if they ask about it."
            )

        # 3. Configure Agent Prompt
        prompt = ChatPromptTemplate.from_messages([
            ("system", system_prompt_text),
            MessagesPlaceholder(variable_name="chat_history"),
            ("human", "{input}"),
            MessagesPlaceholder(variable_name="agent_scratchpad"),
        ])

        # 4. Initialize Universal Tool Calling Agent
        agent = create_tool_calling_agent(llm, tools, prompt)
        agent_executor = AgentExecutor(agent=agent, tools=tools, verbose=False, handle_parsing_errors=True)

        # 5. Handle Conversation Memory
        if session_id not in CHAT_MEMORY:
            CHAT_MEMORY[session_id] = []
        history = CHAT_MEMORY[session_id]

        # 6. Execute AI Request Asynchronously
        try:
            response = await agent_executor.ainvoke({
                "input": query,
                "chat_history": history
            })
            
            agent_reply = response.get("output", "I encountered an issue processing that request.")
            sources = [word for word in agent_reply.split() if word.startswith("http")]

            # Update Memory Context
            history.append(HumanMessage(content=query))
            history.append(AIMessage(content=agent_reply))
            
            if len(history) > MAX_HISTORY_LENGTH * 2:
                CHAT_MEMORY[session_id] = history[-(MAX_HISTORY_LENGTH * 2):]

            return agent_reply, list(set(sources)), used_model_name

        except Exception as e:
            logger.error(f"Agent Execution Failed: {str(e)}")
            raise RuntimeError("The context-aware agent failed to process the message.")

# Export a singleton instance for the FastAPI router
context_chat_agent = ContextChatAgent()