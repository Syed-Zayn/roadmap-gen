import os
import httpx
import logging
from typing import Tuple, List, Dict, Optional
from sqlalchemy.ext.asyncio import AsyncSession

# Import Multi-LLM Wrappers
from langchain_google_genai import ChatGoogleGenerativeAI
from langchain_anthropic import ChatAnthropic
from langchain_openai import ChatOpenAI, OpenAIEmbeddings

from langchain_core.prompts import ChatPromptTemplate, MessagesPlaceholder
from langchain_core.messages import HumanMessage, AIMessage, BaseMessage

from langchain_classic.agents import AgentExecutor, create_tool_calling_agent
from langchain_core.tools import tool, StructuredTool
from core.config import settings
from db.pinecone import vector_store

logger = logging.getLogger(__name__)

# =======================================================================
# Enterprise Memory Store (In-Memory for demonstration/fast retrieval)
# =======================================================================
CHAT_MEMORY: Dict[str, List[BaseMessage]] = {}
MAX_HISTORY_LENGTH = 10

# =======================================================================
# Internal Enterprise Helpers for RAG
# =======================================================================
async def _fetch_private_notes(user_id: str, query: str) -> str:
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
        
        # Fetch strictly from the user's isolated namespace
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
            
            # Relaxed score threshold (0.1) to ensure even short note names get matched
            if text and score >= 0.1: 
                contexts.append(f"--- Note Title: {title} ---\n{text}")
        
        return "\n\n".join(contexts)
    except Exception as e:
        logger.error(f"Pinecone Pre-Retrieval Error: {str(e)}")
        return ""

# =======================================================================
# Enterprise Tools Definition (Dynamic Integrations)
# =======================================================================
@tool
def search_knowledge_base(query: str) -> str:
    """
    Searches the Pinecone vector database for relevant study materials, tutorials, and curriculum documents.
    Best for answering student questions regarding their technical domain.
    """
    try:
        index = vector_store.get_index()
        # Embeddings MUST remain OpenAI to match the 1536-dimensional vectors already stored in Pinecone
        embeddings = OpenAIEmbeddings(
            api_key=settings.OPENAI_API_KEY, 
            model="text-embedding-3-small"
        )
        query_vector = embeddings.embed_query(query)
        
        # Fetch top 3 most relevant context chunks
        results = index.query(
            vector=query_vector, 
            top_k=3, 
            include_metadata=True
        )
        
        contexts = []
        for match in results.get("matches", []):
            metadata = match.get("metadata", {})
            text = metadata.get("text", "")
            url = metadata.get("url", "")
            if text:
                contexts.append(f"Content: {text}\nSource URL: {url}")
                
        return "\n\n".join(contexts) if contexts else "No relevant study materials found in the knowledge base."
    except Exception as e:
        logger.error(f"Knowledge Base Tool Error: {str(e)}")
        return "The knowledge base is currently unavailable."

# =======================================================================
# Core Agent Orchestrator (Multi-LLM Router)
# =======================================================================
async def process_chat_message(
    query: str, 
    user_id: str, 
    user_role: str, 
    session_id: str, 
    db: AsyncSession,
    selected_model: Optional[str] = None
) -> Tuple[str, List[str], str]:
    """
    Orchestrates the LangChain AI agent with Multi-LLM Dynamic Routing.
    Returns a tuple of (Agent_Response_String, List_Of_Source_URLs, Used_Model_String).
    """
    logger.info(f"Chat Agent Init | Session: {session_id} | Role: {user_role} | Requested Model: {selected_model}")

    # 1. Multi-LLM Dynamic Router
    used_model_name = "Gemini 2.5 Flash" # Default fallback
    
    if selected_model:
        model_str = selected_model.lower()
        if "claude" in model_str:
            # ENTERPRISE FIX 1: HTTP Proxy support for Anthropic Geo-Blocking
            # Reads proxy configuration from standard environment variables
            proxy_url = os.getenv("ANTHROPIC_PROXY_URL") or os.getenv("HTTPS_PROXY") or os.getenv("HTTP_PROXY")
            
            claude_kwargs = {
                "api_key": settings.ANTHROPIC_API_KEY, 
                "model": "claude-opus-4-20250514", 
                "temperature": 0.3, 
                "max_retries": 3
            }
            
            # Inject explicit httpx client with proxy routing if a proxy URL is configured
            if proxy_url:
                logger.info(f"Routing Claude 3.5 requests securely through HTTP Proxy: {proxy_url}")
                proxy_mounts = {
                    "http://": httpx.AsyncHTTPTransport(proxy=proxy_url),
                    "https://": httpx.AsyncHTTPTransport(proxy=proxy_url),
                }
                # Setup sync and async clients to ensure both core and wrapped LangChain calls bypass geo-blocks
                claude_kwargs["http_client"] = httpx.Client(proxy=proxy_url)
                claude_kwargs["http_async_client"] = httpx.AsyncClient(mounts=proxy_mounts)

            llm = ChatAnthropic(**claude_kwargs)
            used_model_name = "Claude 3.5 Sonnet"
            
        elif "gpt" in model_str:
            llm = ChatOpenAI(
                api_key=settings.OPENAI_API_KEY, 
                model=selected_model, 
                temperature=0.3, max_retries=3
            )
            used_model_name = "OpenAI GPT-4o"
        else:
            llm = ChatGoogleGenerativeAI(
                api_key=settings.GEMINI_API_KEY, 
                model="gemini-2.5-flash", 
                temperature=0.3, max_retries=3
            )
            used_model_name = "Google Gemini"
    else:
        # If no model is selected by frontend, fallback to the ultra-fast configured chat model
        llm = ChatGoogleGenerativeAI(
            api_key=settings.GEMINI_API_KEY,
            model=settings.CHAT_LLM_MODEL,
            temperature=0.3, max_retries=3
        )
        used_model_name = "Google Gemini"

    # 2. Bind Dynamic Private Tool (Aware of user_id)
    async def search_my_private_notes_tool(search_query: str) -> str:
        """Tool: Searches the student's personal private notes in the Pinecone vector database."""
        notes = await _fetch_private_notes(user_id, search_query)
        return notes if notes else "I couldn't find any relevant information in your private notes."

    dynamic_notes_tool = StructuredTool.from_function(
        coroutine=search_my_private_notes_tool,
        name="search_my_private_notes",
        description="ALWAYS use this tool when the user asks about their personal notes, specific concepts they saved, or custom knowledge."
    )

    tools = [search_knowledge_base, dynamic_notes_tool]

    # 3. Pre-Retrieval RAG Injection 
    logger.info(f"Executing Pre-Retrieval RAG for User {user_id}")
    injected_notes = await _fetch_private_notes(user_id, query)
    
    rag_context = ""
    if injected_notes:
        rag_context = (
            "\n\n--- PRIVATE KNOWLEDGE BASE (RAG CONTEXT) ---\n"
            "The user has saved the following private notes. If they ask about these concepts, "
            "you MUST use this information to answer directly and prioritize it.\n\n"
            f"{injected_notes}\n"
            "----------------------------------------------\n"
        )

    # 4. Construct Context-Aware Prompt
    system_instruction = (
        "You are an intelligent educational assistant in the 'Personalized Curriculum Generator' system. "
        f"You are currently talking to a {user_role}. "
        "Use the provided tools to fetch real data before answering. "
        f"{rag_context}"
        "If you do not know the answer, explicitly state that you don't know. "
        "Maintain a professional, encouraging, and highly technical tone."
    )

    prompt = ChatPromptTemplate.from_messages([
        ("system", system_instruction),
        MessagesPlaceholder(variable_name="chat_history"),
        ("human", "{input}"),
        MessagesPlaceholder(variable_name="agent_scratchpad"),
    ])

    # 5. Handle Conversation Memory (Chat History)
    if session_id not in CHAT_MEMORY:
        CHAT_MEMORY[session_id] = []
    history = CHAT_MEMORY[session_id]

    # 6. Compile the Universal Tool Calling Agent
    agent = create_tool_calling_agent(llm, tools, prompt)
    agent_executor = AgentExecutor(
        agent=agent, 
        tools=tools, 
        verbose=False,
        handle_parsing_errors=True
    )

    # 7. Execute the Agent Asynchronously
    try:
        response = await agent_executor.ainvoke({
            "input": query,
            "chat_history": history
        })
        
        output_text = response.get("output", "I'm sorry, I could not process that request.")
        
        # ENTERPRISE FIX 2: Safely parse LangChain's array/dict responses (common with Gemini) into strings before splitting
        if isinstance(output_text, list):
            text_fragments = []
            for item in output_text:
                if isinstance(item, dict) and "text" in item:
                    text_fragments.append(item["text"])
                elif isinstance(item, str):
                    text_fragments.append(item)
                else:
                    text_fragments.append(str(item))
            output_text = " ".join(text_fragments)
        elif not isinstance(output_text, str):
            output_text = str(output_text)
            
        # Extract URLs if the RAG tool was used
        sources = [word for word in output_text.split() if word.startswith("http")]
        
        # Update Memory Context
        history.append(HumanMessage(content=query))
        history.append(AIMessage(content=output_text))
        
        # Prune memory to prevent token overflow
        if len(history) > MAX_HISTORY_LENGTH * 2:
            CHAT_MEMORY[session_id] = history[-(MAX_HISTORY_LENGTH * 2):]
        
        return output_text, list(set(sources)), used_model_name
        
    except Exception as e:
        logger.error(f"Agent Execution Failure ({used_model_name}): {str(e)}")
        raise Exception("Failed to execute AI reasoning loop.")