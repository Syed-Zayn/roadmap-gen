import os
from celery import Celery
from core.config import settings

# Initialize the Celery application bound to the Redis broker
celery_app = Celery(
    "curriculum_worker",
    broker=settings.REDIS_URL,
    backend=settings.REDIS_URL,
    include=["worker.tasks"]  # Explicitly declare where the worker should look for tasks
)

# Enterprise configuration for robust background processing
celery_app.conf.update(
    task_serializer="json",
    accept_content=["json"],
    result_serializer="json",
    timezone="UTC",
    enable_utc=True,
    
    # Task Acknowledgment: Ensures a task isn't lost if the worker crashes midway
    task_acks_late=True,
    
    # Prefetch Multiplier: Prevents a single fast worker from hoarding all tasks. 
    # Setting to 1 ensures fair distribution across multiple worker nodes.
    worker_prefetch_multiplier=1,
    
    # Prevents memory leaks by restarting the worker process after processing 100 tasks
    worker_max_tasks_per_child=100
)

# Optional: Ensure logging is standardized
celery_app.conf.worker_hijack_root_logger = False