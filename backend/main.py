import logging
from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.util import get_remote_address
from slowapi.errors import RateLimitExceeded

from core.config import settings

# Import the master API router that aggregates all feature routes (auth, roadmap, sandbox, collab, etc.)
from api.v1.api import api_router

# Import database engine and Base declarative class
from db.session import engine, Base

# CRITICAL: We must import all SQLAlchemy models here so they are registered with Base.metadata
# before we call create_all() during the application startup event.
import models.user
import models.roadmap
import models.progress

# Configure structured logging for system events
logger = logging.getLogger(__name__)

# Initialize rate limiter using the client's IP address to prevent API abuse
limiter = Limiter(key_func=get_remote_address)

@asynccontextmanager
async def lifespan(app: FastAPI):
    """
    Lifespan event manager for the FastAPI application.
    Executes critical startup and shutdown procedures, specifically automated database provisioning.
    """
    logger.info("Initializing system: Triggering automatic database table creation...")
    try:
        # Safely create tables if they do not exist using the async engine
        # run_sync is required because create_all is a synchronous SQLAlchemy method
        async with engine.begin() as conn:
            await conn.run_sync(Base.metadata.create_all)
        logger.info("Database tables successfully verified and initialized.")
    except Exception as e:
        logger.error(f"Critical error during database table creation: {str(e)}")
        raise e
        
    yield  # Yield control back to FastAPI to start handling incoming HTTP and WebSocket requests
    
    # Gracefully close database connections during application shutdown to prevent connection leaks
    logger.info("System shutting down: Disposing database engine connections and active WebSocket streams...")
    await engine.dispose()

def create_app() -> FastAPI:
    """
    Application factory to configure and return the FastAPI instance.
    Centralizes all middleware, routing, exception handling setups, and native WebSocket configurations.
    """
    app = FastAPI(
        title=settings.PROJECT_NAME,
        openapi_url=f"{settings.API_V1_STR}/openapi.json",
        docs_url="/docs",
        redoc_url="/redoc",
        lifespan=lifespan  # Attach the asynchronous lifespan manager for DB initialization
    )

    # Attach the SlowAPI rate limiter to application state
    app.state.limiter = limiter
    app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

    # Configure Cross-Origin Resource Sharing (CORS)
    # ENTERPRISE FEATURE 10 CONTEXT: FastAPI natively supports WebSockets within the ASGI lifecycle. 
    # WebSocket connections bypass traditional CORS preflight, but initial HTTP Handshakes 
    # for the Collab IDE (YJS) and Voice Agent will be strictly validated against these origins here.
    if settings.BACKEND_CORS_ORIGINS:
        app.add_middleware(
            CORSMiddleware,
            allow_origins=[str(origin) for origin in settings.BACKEND_CORS_ORIGINS],
            allow_credentials=True,
            allow_methods=["*"],
            allow_headers=["*"],
        )

    # Inject the master API router into the main FastAPI application
    # This automatically prefixes all modular endpoints with '/api/v1'
    app.include_router(api_router, prefix=settings.API_V1_STR)

    return app

# Instantiate the global application object for the ASGI server (Uvicorn)
app = create_app()

@app.get("/health", tags=["System"])
async def health_check():
    """
    Standard load balancer health check endpoint to verify API and WebSocket uptime.
    Useful for container orchestration systems like Docker/Kubernetes to check service health.
    """
    return {
        "status": "operational", 
        "service": settings.PROJECT_NAME
    }