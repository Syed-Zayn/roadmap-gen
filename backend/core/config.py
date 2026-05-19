from typing import List
from pydantic_settings import BaseSettings, SettingsConfigDict

class Settings(BaseSettings):
    # Application base configuration
    PROJECT_NAME: str = "Personalized Curriculum Generator"
    API_V1_STR: str = "/api/v1"
    DOMAIN: str = "localhost" 
    
    
    FRONTEND_URL: str = "http://localhost:3000"
    
    # CORS setup to strictly allow requests from the Next.js frontend
    BACKEND_CORS_ORIGINS: List[str] = ["http://localhost:3000"]

    # Relational Database Connections (PostgreSQL)
    POSTGRES_USER: str
    POSTGRES_PASSWORD: str
    POSTGRES_DB: str
    POSTGRES_HOST: str
    POSTGRES_PORT: int
    DATABASE_URL: str

    # Message Broker / Distributed Cache
    REDIS_URL: str
    # ENTERPRISE CACHE TUNING: Default TTL for YouTube API cache (30 Days in seconds)
    REDIS_CACHE_TTL: int = 2592000

    # Security and Authentication
    SECRET_KEY: str
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 1440  # 24 hours validity

    # External APIs (Vector Store & Media)
    YOUTUBE_API_KEY: str
    PINECONE_API_KEY: str
    PINECONE_ENVIRONMENT: str

    # =======================================================================
    # Multi-LLM Router Architecture Keys & Models (Phase 2)
    # =======================================================================
    
    # 1. OpenAI (Strictly for Roadmap Generation & JSON structured outputs)
    OPENAI_API_KEY: str
    ROADMAP_LLM_MODEL: str = "gpt-4o"
    OPENAI_MODEL_NAME: str = "gpt-4o-mini"
    
    # 2. Anthropic (Strictly for Code Evaluation & Sandboxing)
    ANTHROPIC_API_KEY: str
    CODE_LLM_MODEL: str = "claude-opus-4-20250514"
    
    # 3. Google Gemini (Strictly for Context-Aware Chat & Voice AI)
    GEMINI_API_KEY: str
    CHAT_LLM_MODEL: str = "gemini-2.5-flash"

    # Enforce loading from .env file and strict case sensitivity
    model_config = SettingsConfigDict(env_file=".env", case_sensitive=True, extra="ignore")

# Instantiate settings to be imported across the application
settings = Settings()