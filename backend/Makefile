# Run everything in background
up:
	docker-compose up -d --build

# Stop and remove containers
down:
	docker-compose down

# View logs for API and Worker
logs:
	docker-compose logs -f fastapi_app celery_worker

# Database Migrations (Run this after creating models)
migrate:
	docker-compose exec fastapi_app alembic revision --autogenerate -m "auto-migration"
	docker-compose exec fastapi_app alembic upgrade head

# Rebuild Next.js (if dependencies change)
build-front:
	docker-compose build nextjs_front