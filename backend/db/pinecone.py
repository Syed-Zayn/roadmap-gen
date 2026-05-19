import time
import logging
import asyncio
from typing import List, Dict, Any
from pinecone import Pinecone, ServerlessSpec
from core.config import settings

# Configure structured logging for infrastructure components
logger = logging.getLogger(__name__)

class VectorStoreManager:
    """
    Singleton manager for the Pinecone Vector Database connection.
    Ensures only one client instance is created across the application lifecycle
    to prevent connection leaks and optimize memory.
    """
    _instance = None
    _client = None
    
    # ENTERPRISE FIX: Memory Cache for active indexes to prevent redundant cloud API calls
    # Calling list_indexes() on every request blocks the event loop and causes timeouts.
    _index_cache = {}

    def __new__(cls):
        if cls._instance is None:
            cls._instance = super(VectorStoreManager, cls).__new__(cls)
            cls._instance._initialize_client()
        return cls._instance

    def _initialize_client(self):
        """
        Initializes the Pinecone client securely using environment variables.
        """
        try:
            # Pinecone SDK v3+ initialization
            self._client = Pinecone(
                api_key=settings.PINECONE_API_KEY
            )
            logger.info("Successfully authenticated with Pinecone Vector Database.")
        except Exception as e:
            logger.error(f"Failed to initialize Pinecone client. Check API keys. Error: {str(e)}")
            raise

    def get_index(self, index_name: str = "curriculum-index"):
        """
        Dynamically fetches the Pinecone index.
        Uses a local dictionary cache to return the index object instantly if already loaded.
        """
        # ENTERPRISE FIX: Return immediately if index is already cached
        if index_name in self._index_cache:
            return self._index_cache[index_name]

        if not self._client:
            self._initialize_client()

        try:
            # Fetch the list of existing indexes from the Pinecone cloud
            existing_indexes = [index_info.name for index_info in self._client.list_indexes()]
            
            if index_name not in existing_indexes:
                logger.info(f"Index '{index_name}' not found. Provisioning a new vector store...")
                
                # Create a new Serverless Index optimized for OpenAI embeddings
                self._client.create_index(
                    name=index_name,
                    dimension=1536,  # Standard dimension for OpenAI's text-embedding-3-small
                    metric="cosine", # Cosine similarity is mathematically optimal for semantic search
                    spec=ServerlessSpec(
                        cloud="aws",
                        region=settings.PINECONE_ENVIRONMENT
                    )
                )
                
                logger.info(f"Waiting for index '{index_name}' initialization to complete...")
                
                # Enterprise Safety Guard: Block execution until the cloud infrastructure is fully ready
                while not self._client.describe_index(index_name).status['ready']:
                    time.sleep(1)
                    
                logger.info(f"Index '{index_name}' is now created and ready for embedding operations.")
            else:
                logger.info(f"Existing index '{index_name}' found. Connecting...")

            # Store the active index object in cache for future queries
            self._index_cache[index_name] = self._client.Index(index_name)
            return self._index_cache[index_name]

        except Exception as e:
            logger.error(f"Failed to retrieve or create Pinecone index '{index_name}'. Error: {str(e)}")
            raise

    # =======================================================================
    # Phase 2 Enterprise Upgrades: Multi-Tenant Data Isolation (Namespaces)
    # =======================================================================

    async def aupsert_user_document(self, user_id: str, vector_id: str, vector: List[float], metadata: Dict[str, Any], index_name: str = "curriculum-index"):
        """
        Asynchronously upserts a vectorized document into a highly isolated user namespace.
        Prevents data bleeding between students.
        """
        def _upsert():
            # ENTERPRISE FIX: Moved get_index inside the thread to prevent event loop blocking
            index = self.get_index(index_name)
            
            # The namespace parameter enforces physical separation within the same index
            index.upsert(
                vectors=[{"id": vector_id, "values": vector, "metadata": metadata}], 
                namespace=str(user_id)
            )
            
        # Offload synchronous Pinecone SDK calls to a background thread to unblock FastAPI
        await asyncio.to_thread(_upsert)

    async def aquery_user_documents(self, user_id: str, query_vector: List[float], top_k: int = 5, index_name: str = "curriculum-index") -> Dict[str, Any]:
        """
        Asynchronously executes a semantic search STRICTLY within the user's isolated namespace.
        """
        def _query():
            # ENTERPRISE FIX: Moved get_index inside the thread
            index = self.get_index(index_name)
            
            return index.query(
                vector=query_vector, 
                top_k=top_k, 
                include_metadata=True, 
                namespace=str(user_id)
            )
            
        return await asyncio.to_thread(_query)

# Expose an initialized singleton instance of the vector store manager
vector_store = VectorStoreManager()