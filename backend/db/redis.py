import logging
import redis.asyncio as redis
from core.config import settings

# Configure enterprise-grade logging for Redis lifecycle monitoring
logger = logging.getLogger(__name__)

class RedisManager:
    """
    Enterprise singleton manager for Redis caching.
    Utilizes connection pooling to handle high-concurrency requests efficiently 
    without dropping connections or overwhelming the Redis server.
    """
    _pool = None
    _client = None

    @classmethod
    def get_client(cls) -> redis.Redis:
        """
        Returns a shared asynchronous Redis client.
        Initializes the connection pool lazily on the first request.
        """
        if cls._client is None:
            try:
                # decode_responses=True ensures we get UTF-8 strings back instead of bytes, 
                # which saves manual parsing time across the application.
                cls._pool = redis.ConnectionPool.from_url(
                    settings.REDIS_URL,
                    decode_responses=True,
                    max_connections=100  # Guardrail: Prevent connection exhaustion
                )
                cls._client = redis.Redis(connection_pool=cls._pool)
                logger.info("Redis connection pool initialized successfully.")
            except Exception as e:
                logger.error(f"Failed to initialize Redis connection pool: {str(e)}")
                raise RuntimeError("Redis cache engine is unavailable. System performance will degrade.")
        
        return cls._client

    @classmethod
    async def close_pool(cls):
        """
        Gracefully closes the connection pool. 
        Intended to be called during the FastAPI application lifespan shutdown event.
        """
        if cls._client:
            await cls._client.aclose()
            logger.info("Redis connection pool gracefully shut down.")

# Export a clean dependency-injection-friendly function
def get_redis_client() -> redis.Redis:
    return RedisManager.get_client()