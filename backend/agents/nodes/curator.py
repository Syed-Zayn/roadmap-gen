import asyncio
import logging
import httpx
import redis.asyncio as redis
from typing import Dict, Any
from core.config import settings
from db.pinecone import vector_store
from agents.state import CurriculumState
from langchain_openai import OpenAIEmbeddings

# Configure enterprise-grade logging
logger = logging.getLogger(__name__)

# =======================================================================
# Enterprise Redis Distributed Cache Pool
# Prevents network latency by caching repetitive AI resource queries
# =======================================================================
redis_pool = redis.ConnectionPool.from_url(settings.REDIS_URL, decode_responses=True)
cache = redis.Redis(connection_pool=redis_pool)

# Concurrency Guard: Limit simultaneous YouTube API hits to prevent 429 Too Many Requests
youtube_semaphore = asyncio.Semaphore(5)

async def fetch_youtube_video(query: str, client: httpx.AsyncClient) -> str:
    """
    Fetches an optimal tutorial video for the given query.
    Implements Redis caching and strict timeouts for zero-latency user experience.
    """
    # Normalize query for consistent cache keys
    cache_key = f"yt_resource:{query.strip().lower().replace(' ', '_')}"
    
    try:
        # Check Redis Cache First (Latency: ~2ms)
        cached_url = await cache.get(cache_key)
        if cached_url:
            logger.info(f"Redis Cache HIT for YouTube topic: '{query}'")
            return cached_url
    except Exception as e:
        logger.warning(f"Redis Cache connection failed: {str(e)}")

    api_key = getattr(settings, "YOUTUBE_API_KEY", None)
    if not api_key:
        return ""

    url = "https://www.googleapis.com/youtube/v3/search"
    params = {
        "part": "snippet",
        "q": f"{query} programming tutorial",
        "type": "video",
        "maxResults": 1,
        "key": api_key
    }
    
    try:
        # Use semaphore to prevent hitting YouTube API rate limits
        async with youtube_semaphore:
            # Strict 2.0 second timeout to prevent the LangGraph execution from hanging
            response = await client.get(url, params=params, timeout=2.0)
            response.raise_for_status()
            data = response.json()
            
            if data.get("items"):
                video_id = data["items"][0]["id"]["videoId"]
                video_url = f"https://www.youtube.com/watch?v={video_id}"
                
                # Asynchronously save to cache for 30 days (2592000 seconds)
                try:
                    await cache.setex(cache_key, 2592000, video_url)
                except Exception as e:
                    logger.warning(f"Failed to set Redis cache: {str(e)}")
                    
                return video_url
                
    except httpx.HTTPStatusError as e:
        logger.error(f"YouTube API Rate Limit/Error for '{query}': {e.response.status_code}")
    except httpx.TimeoutException:
        logger.warning(f"YouTube API Timeout for '{query}'. Falling back to internal Pinecone docs.")
    except Exception as e:
        logger.error(f"YouTube API fetch failed for query '{query}': {str(e)}")
    
    # Graceful fallback: return empty string so the system doesn't crash
    return ""

async def fetch_pinecone_context(query: str) -> str:
    """
    Queries the internal Pinecone Vector Database for proprietary study materials.
    """
    try:
        embeddings = OpenAIEmbeddings(
            api_key=settings.OPENAI_API_KEY,
            model="text-embedding-3-small"
        )
        # Generate embeddings asynchronously
        query_vector = await embeddings.aembed_query(query)
        
        index = vector_store.get_index()
        # Pinecone's standard client is synchronous, so we offload it to a background thread
        result = await asyncio.to_thread(
            index.query,
            vector=query_vector,
            top_k=1,
            include_metadata=True
        )
        
        if result.get("matches"):
            return result["matches"][0]["metadata"].get("url", "Internal Documentation Match Found")
            
    except Exception as e:
        logger.error(f"Pinecone retrieval failed for query '{query}': {str(e)}")
        
    return ""

async def enrich_task_data(task: Dict[str, Any], client: httpx.AsyncClient) -> None:
    """
    Simultaneously fetches external videos and internal vector context for a single task.
    """
    topic = task.get("title")
    if not topic:
        return

    # Execute both retrievals concurrently to slash latency
    yt_link, doc_link = await asyncio.gather(
        fetch_youtube_video(topic, client),
        fetch_pinecone_context(topic)
    )
    
    task["resources"] = []
    
    if yt_link:
        task["resources"].append({"type": "video", "url": yt_link})
    if doc_link:
        task["resources"].append({"type": "documentation", "url": doc_link})

async def curator_node(state: CurriculumState) -> Dict[str, Any]:
    """
    The Curator Agent. Traverses the final approved roadmap and enriches it with 
    highly relevant learning resources (YouTube + Vector DB).
    """
    logger.info("Curator Agent: Enriching curriculum with multimedia resources...")
    
    final_roadmap = state.get("draft_roadmap")
    if not final_roadmap:
        return {"errors": ["Curator Error: No approved draft roadmap available."]}

    tasks_to_enrich = []
    
    # Flatten the roadmap structure to identify tasks that need resources
    for milestone in final_roadmap.get("milestones", []):
        for task in milestone.get("tasks", []):
            if task.get("task_type") in ["Resource", "Coding"]:
                tasks_to_enrich.append(task)

    if tasks_to_enrich:
        # Utilize a highly optimized HTTP client with connection pooling
        async with httpx.AsyncClient(limits=httpx.Limits(max_connections=50, max_keepalive_connections=10)) as client:
            enrichment_coroutines = [enrich_task_data(task, client) for task in tasks_to_enrich]
            
            # Fire all resource enrichment tasks concurrently
            await asyncio.gather(*enrichment_coroutines)

    logger.info("Curator Agent: Resource curation successfully completed.")

    return {
        "final_roadmap": final_roadmap
    }