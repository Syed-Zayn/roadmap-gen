from fastapi import APIRouter

# Import individual feature routers
from api.v1.auth import router as auth_router
from api.v1.roadmap import router as roadmap_router
from api.v1.sandbox import router as sandbox_router
from api.v1.quiz import router as quiz_router
from api.v1.chat import router as chat_router
from api.v1.export import router as export_router
from api.v1.teacher import router as teacher_router
from api.v1.remediation import router as remediation_router
from api.v1.assessment import router as assessment_router
from api.v1.voice import router as voice_router
from api.v1.notes import router as notes_router
from api.v1.admin import router as admin_router

# ENTERPRISE PHASE 3: Import Killer Feature Routers
from api.v1.vision import router as vision_router
from api.v1.interview import router as interview_router
from api.v1.collab import router as collab_router

# FEATURE 1: Import Skill Tree Gamification & Progress Router
from api.v1.progress import router as progress_router

# Initialize the master API router for version 1
api_router = APIRouter()

# Mount all individual routers to the master router.
api_router.include_router(auth_router)
api_router.include_router(roadmap_router)
api_router.include_router(sandbox_router)
api_router.include_router(quiz_router)
api_router.include_router(chat_router)
api_router.include_router(export_router)
api_router.include_router(teacher_router)
api_router.include_router(assessment_router)
api_router.include_router(remediation_router)
api_router.include_router(voice_router)
api_router.include_router(notes_router)
api_router.include_router(admin_router)

# ENTERPRISE PHASE 3: Mount the new Killer Features
api_router.include_router(vision_router)
api_router.include_router(interview_router)
api_router.include_router(collab_router)

# Mount the Progress & Gamification engine
api_router.include_router(progress_router)