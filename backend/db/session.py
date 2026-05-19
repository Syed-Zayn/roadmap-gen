from collections.abc import AsyncGenerator
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.orm import declarative_base
from core.config import settings

# -------------------------------------------------------------------
# Database Engine Configuration
# -------------------------------------------------------------------
# Using asyncpg for high-performance non-blocking database operations.
# Pool size and max overflow are configured to handle concurrent traffic spikes 
# without dropping connections or overwhelming the database.
engine = create_async_engine(
    settings.DATABASE_URL,
    echo=False,  # Set to True for debugging SQL queries in development
    future=True,
    pool_size=20,
    max_overflow=10,
    pool_timeout=30.0,
    pool_recycle=1800  # Recycle connections after 30 mins to prevent stale sessions
)

# Create an async session factory bound to the engine
AsyncSessionLocal = async_sessionmaker(
    bind=engine,
    class_=AsyncSession,
    autocommit=False,
    autoflush=False,
    expire_on_commit=False  # Crucial for async operations to avoid missing data after commits
)

# Declarative base class for all SQLAlchemy ORM models
Base = declarative_base()

# -------------------------------------------------------------------
# Dependency Injection
# -------------------------------------------------------------------
async def get_db() -> AsyncGenerator[AsyncSession, None]:
    """
    FastAPI dependency that provides a database session per request.
    Ensures the session is properly closed after the request finishes,
    preventing connection leaks.
    """
    async with AsyncSessionLocal() as session:
        try:
            yield session
        except Exception:
            # Rollback the transaction automatically if an error occurs during the request
            await session.rollback()
            raise
        finally:
            # Session is safely closed and returned to the pool
            await session.close()