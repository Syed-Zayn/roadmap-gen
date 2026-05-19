import uuid
from sqlalchemy import Column, String, DateTime, ForeignKey, Text
from sqlalchemy.dialects.postgresql import UUID # ENTERPRISE FIX: Import native PostgreSQL UUID
from sqlalchemy.orm import relationship
from datetime import datetime

from db.session import Base

class Note(Base):
    """
    SQLAlchemy Model for the Enterprise PostgreSQL Database.
    This acts as the single source of truth for the raw textual content of a Private Note,
    serving as the foundation before it gets converted into embeddings for Pinecone RAG.
    """
    __tablename__ = "notes"

    # Unified UUID that links the PostgreSQL record perfectly with the Pinecone Vector ID
    id = Column(String, primary_key=True, index=True, default=lambda: str(uuid.uuid4()))
    
    # ENTERPRISE FIX: Changed String to UUID(as_uuid=True) to perfectly match the User.id datatype
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), index=True, nullable=False)
    
    # Note metadata and content
    title = Column(String, index=True, nullable=False)
    content = Column(Text, nullable=False)
    
    # Audit trail timestamps
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)

    # Establish ORM relationship back to the User model
    owner = relationship("User", back_populates="notes")