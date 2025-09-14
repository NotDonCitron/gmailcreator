"""
RAG Engine for Code Analysis and Question Answering

This module implements the core RAG (Retrieval-Augmented Generation) functionality
for analyzing code repositories and answering questions about the codebase.
"""

import os
import json
import logging
from typing import List, Dict, Any, Optional, Tuple
from dataclasses import dataclass
import numpy as np
from datetime import datetime

# Import required libraries with fallback for missing dependencies
try:
    from sentence_transformers import SentenceTransformer
    HAS_SENTENCE_TRANSFORMERS = True
except ImportError:
    HAS_SENTENCE_TRANSFORMERS = False
    logging.warning("sentence-transformers not available. Using fallback embeddings.")

try:
    import chromadb
    from chromadb.config import Settings
    HAS_CHROMADB = True
except ImportError:
    HAS_CHROMADB = False
    logging.warning("chromadb not available. Using in-memory vector store.")

try:
    import openai
    HAS_OPENAI = True
except ImportError:
    HAS_OPENAI = False
    logging.warning("openai not available. Using mock responses.")

from code_parser import Document, CodeParser
from config.settings import get_settings

logger = logging.getLogger(__name__)


@dataclass
class SearchResult:
    """Represents a search result from the RAG engine."""
    document: Document
    score: float
    metadata: Dict[str, Any]


@dataclass
class RAGResponse:
    """Represents a response from the RAG engine."""
    answer: str
    sources: List[SearchResult]
    confidence: float
    metadata: Dict[str, Any]


class VectorStore:
    """Vector store for document embeddings."""
    
    def __init__(self, collection_name: str = "code_documents"):
        self.collection_name = collection_name
        self.documents = []
        self.embeddings = []
        self.metadata = []
        
        if HAS_CHROMADB:
            try:
                self.client = chromadb.Client(Settings(
                    chroma_db_impl="duckdb+parquet",
                    persist_directory="./chroma_db"
                ))
                self.collection = self.client.get_or_create_collection(
                    name=collection_name,
                    metadata={"hnsw:space": "cosine"}
                )
                logger.info("Using ChromaDB vector store")
            except Exception as e:
                logger.warning(f"Failed to initialize ChromaDB: {e}. Using in-memory store.")
                self.client = None
                self.collection = None
        else:
            self.client = None
            self.collection = None
            logger.info("Using in-memory vector store")
    
    def add_documents(self, documents: List[Document], embeddings: List[List[float]]) -> bool:
        """Add documents to the vector store."""
        try:
            if self.collection:
                # Use ChromaDB
                texts = [doc.content for doc in documents]
                metadatas = [doc.metadata for doc in documents]
                ids = [doc.id for doc in documents]
                
                self.collection.add(
                    documents=texts,
                    embeddings=embeddings,
                    metadatas=metadatas,
                    ids=ids
                )
            else:
                # Use in-memory storage
                self.documents.extend(documents)
                self.embeddings.extend(embeddings)
                self.metadata.extend([doc.metadata for doc in documents])
            
            logger.info(f"Added {len(documents)} documents to vector store")
            return True
        except Exception as e:
            logger.error(f"Failed to add documents to vector store: {e}")
            return False
    
    def search(self, query_embedding: List[float], top_k: int = 5) -> List[Tuple[Document, float]]:
        """Search for similar documents."""
        try:
            if self.collection:
                # Use ChromaDB
                results = self.collection.query(
                    query_embeddings=[query_embedding],
                    n_results=top_k
                )
                
                search_results = []
                for i, (doc_id, distance, metadata, content) in enumerate(zip(
                    results['ids'][0],
                    results['distances'][0],
                    results['metadatas'][0],
                    results['documents'][0]
                )):
                    doc = Document(
                        id=doc_id,
                        content=content,
                        metadata=metadata,
                        doc_type=metadata.get('doc_type', 'unknown')
                    )
                    # Convert distance to similarity score (1 - distance for cosine similarity)
                    score = 1.0 - distance
                    search_results.append((doc, score))
                
                return search_results
            else:
                # Use in-memory search with cosine similarity
                if not self.embeddings:
                    return []
                
                query_embedding = np.array(query_embedding)
                similarities = []
                
                for i, doc_embedding in enumerate(self.embeddings):
                    doc_embedding = np.array(doc_embedding)
                    similarity = self._cosine_similarity(query_embedding, doc_embedding)
                    similarities.append((self.documents[i], similarity))
                
                # Sort by similarity and return top k
                similarities.sort(key=lambda x: x[1], reverse=True)
                return similarities[:top_k]
        
        except Exception as e:
            logger.error(f"Vector search failed: {e}")
            return []
    
    def _cosine_similarity(self, a: np.ndarray, b: np.ndarray) -> float:
        """Calculate cosine similarity between two vectors."""
        dot_product = np.dot(a, b)
        norm_a = np.linalg.norm(a)
        norm_b = np.linalg.norm(b)
        
        if norm_a == 0 or norm_b == 0:
            return 0.0
        
        return dot_product / (norm_a * norm_b)


class EmbeddingModel:
    """Embedding model for text vectorization."""
    
    def __init__(self, model_name: str = "all-MiniLM-L6-v2"):
        self.model_name = model_name
        self.model = None
        self.has_sentence_transformers = HAS_SENTENCE_TRANSFORMERS

        if self.has_sentence_transformers:
            try:
                self.model = SentenceTransformer(model_name)
                logger.info(f"Loaded sentence transformer model: {model_name}")
            except Exception as e:
                logger.warning(f"Failed to load sentence transformer: {e}. Using fallback embeddings.")
                self.has_sentence_transformers = False
    
    def encode(self, texts: List[str]) -> List[List[float]]:
        """Encode texts into embeddings."""
        try:
            if self.has_sentence_transformers and self.model:
                # Use sentence transformers
                embeddings = self.model.encode(texts, convert_to_tensor=False)
                return embeddings.tolist()
            else:
                # Fallback: simple hash-based embeddings
                return self._fallback_encode(texts)

        except Exception as e:
            logger.error(f"Embedding encoding failed: {e}")
            return self._fallback_encode(texts)
    
    def _fallback_encode(self, texts: List[str]) -> List[List[float]]:
        """Fallback encoding using simple hash-based approach."""
        embeddings = []
        
        for text in texts:
            # Simple hash-based embedding (384 dimensions for compatibility)
            embedding = [0.0] * 384
            
            # Create a simple word frequency hash
            words = text.lower().split()
            word_freq = {}
            for word in words:
                word_freq[word] = word_freq.get(word, 0) + 1
            
            # Use word frequencies to create embedding
            for i, (word, freq) in enumerate(word_freq.items()):
                if i < 100:
                    # Simple hash-based encoding
                    embedding[i] = freq * hash(word) % 1000 / 1000.0
            
            embeddings.append(embedding)
        
        return embeddings


class LLMProvider:
    """Language model provider for generating responses."""
    
    def __init__(self, provider: str = "openai", model: str = "gpt-3.5-turbo"):
        self.provider = provider
        self.model = model
        self.settings = get_settings()
        self.has_openai = HAS_OPENAI

        if self.has_openai and provider == "openai":
            try:
                openai.api_key = self.settings.get("openai_api_key")
                if not openai.api_key:
                    logger.warning("OpenAI API key not configured. Using mock responses.")
                    self.has_openai = False
            except Exception as e:
                logger.warning(f"Failed to configure OpenAI: {e}. Using mock responses.")
                self.has_openai = False
    
    def generate_response(self, prompt: str, context: str, max_tokens: int = 500) -> str:
        """Generate a response using the language model."""
        try:
            if self.has_openai and self.provider == "openai":
                # Use OpenAI API
                response = openai.ChatCompletion.create(
                    model=self.model,
                    messages=[
                        {"role": "system", "content": "You are a helpful coding assistant. Answer questions based on the provided code context."},
                        {"role": "user", "content": f"Context:\n{context}\n\nQuestion: {prompt}"}
                    ],
                    max_tokens=max_tokens,
                    temperature=0.1
                )
                return response.choices[0].message.content.strip()
            else:
                # Fallback: generate mock response
                return self._generate_mock_response(prompt, context)
        
        except Exception as e:
            logger.error(f"LLM generation failed: {e}")
            return self._generate_mock_response(prompt, context)
    
    def _generate_mock_response(self, prompt: str, context: str) -> str:
        """Generate a mock response when LLM is not available."""
        # Simple mock response based on keywords in the prompt
        prompt_lower = prompt.lower()
        
        if "function" in prompt_lower or "method" in prompt_lower:
            return "Based on the provided code context, I can see several functions and methods. The main functionality appears to be well-structured with clear separation of concerns."
        elif "class" in prompt_lower:
            return "The code contains several classes that implement the core functionality. Each class has well-defined responsibilities and methods."
        elif "bug" in prompt_lower or "error" in prompt_lower:
            return "Looking at the code, I don't see any obvious bugs or errors. However, I recommend checking edge cases and error handling."
        elif "optimize" in prompt_lower or "performance" in prompt_lower:
            return "The code appears to be reasonably optimized. Consider profiling specific sections if you're experiencing performance issues."
        else:
            return "Based on the provided code context, the implementation looks solid and follows good coding practices. The code is well-organized and maintainable."


class RAGEngine:
    """Main RAG engine for code analysis and question answering."""
    
    def __init__(self, config: Optional[Dict[str, Any]] = None):
        self.config = config or {}
        self.settings = get_settings()
        
        # Initialize components
        self.embedding_model = EmbeddingModel(
            self.config.get("embedding_model", "all-MiniLM-L6-v2")
        )
        self.vector_store = VectorStore(
            self.config.get("collection_name", "code_documents")
        )
        self.llm_provider = LLMProvider(
            provider=self.config.get("llm_provider", "openai"),
            model=self.config.get("llm_model", "gpt-3.5-turbo")
        )
        self.code_parser = CodeParser()
        
        logger.info("RAG Engine initialized")
    
    def index_repository(self, repo_path: str, repo_name: str = "") -> bool:
        """Index a code repository."""
        try:
            logger.info(f"Indexing repository: {repo_path}")
            
            # Parse the repository
            documents = self.code_parser.parse_repository(repo_path, repo_name)
            if not documents:
                logger.warning(f"No documents found in repository: {repo_path}")
                return False
            
            # Generate embeddings
            texts = [doc.content for doc in documents]
            embeddings = self.embedding_model.encode(texts)
            
            # Add to vector store
            success = self.vector_store.add_documents(documents, embeddings)
            
            if success:
                logger.info(f"Successfully indexed {len(documents)} documents from {repo_path}")
            else:
                logger.error(f"Failed to index repository: {repo_path}")
            
            return success
        
        except Exception as e:
            logger.error(f"Repository indexing failed: {e}")
            return False
    
    def query(self, question: str, top_k: int = 5, max_context_tokens: int = 2000) -> RAGResponse:
        """Query the RAG engine with a question."""
        try:
            logger.info(f"Processing query: {question}")
            
            # Generate query embedding
            query_embedding = self.embedding_model.encode([question])[0]
            
            # Search for relevant documents
            search_results = self.vector_store.search(query_embedding, top_k)
            
            if not search_results:
                return RAGResponse(
                    answer="I couldn't find any relevant information in the indexed code repositories.",
                    sources=[],
                    confidence=0.0,
                    metadata={"query": question, "timestamp": datetime.now().isoformat()}
                )
            
            # Prepare context for LLM
            context_parts = []
            total_tokens = 0
            
            for doc, score in search_results:
                doc_content = f"File: {doc.metadata.get('file_path', 'unknown')}\n{doc.content}"
                doc_tokens = len(doc_content.split())
                
                if total_tokens + doc_tokens > max_context_tokens:
                    break
                
                context_parts.append(doc_content)
                total_tokens += doc_tokens
            
            context = "\n\n".join(context_parts)
            
            # Generate response using LLM
            answer = self.llm_provider.generate_response(question, context)
            
            # Create search result objects
            sources = [
                SearchResult(document=doc, score=score, metadata=doc.metadata)
                for doc, score in search_results[:len(context_parts)]
            ]
            
            # Calculate confidence based on search scores
            confidence = sum(score for _, score in search_results[:len(context_parts)]) / len(context_parts)
            
            return RAGResponse(
                answer=answer,
                sources=sources,
                confidence=confidence,
                metadata={
                    "query": question,
                    "timestamp": datetime.now().isoformat(),
                    "context_tokens": total_tokens,
                    "sources_count": len(sources)
                }
            )
        
        except Exception as e:
            logger.error(f"Query processing failed: {e}")
            return RAGResponse(
                answer=f"Sorry, I encountered an error processing your question: {str(e)}",
                sources=[],
                confidence=0.0,
                metadata={"query": question, "timestamp": datetime.now().isoformat(), "error": str(e)}
            )
    
    def get_stats(self) -> Dict[str, Any]:
        """Get statistics about the RAG engine."""
        try:
            if self.vector_store.collection:
                # Use ChromaDB stats
                count = self.vector_store.collection.count()
            else:
                # Use in-memory stats
                count = len(self.vector_store.documents)
            
            return {
                "total_documents": count,
                "embedding_model": self.embedding_model.model_name,
                "llm_provider": self.llm_provider.provider,
                "llm_model": self.llm_provider.model,
                "vector_store_type": "chromadb" if self.vector_store.collection else "in-memory",
                "has_sentence_transformers": HAS_SENTENCE_TRANSFORMERS,
                "has_chromadb": HAS_CHROMADB,
                "has_openai": HAS_OPENAI
            }
        except Exception as e:
            logger.error(f"Failed to get stats: {e}")
            return {"error": str(e)}


def main():
    """Main function for testing the RAG engine."""
    # Configure logging
    logging.basicConfig(
        level=logging.INFO,
        format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
    )
    
    # Create RAG engine
    engine = RAGEngine()
    
    # Print stats
    stats = engine.get_stats()
    print("RAG Engine Stats:")
    for key, value in stats.items():
        print(f"  {key}: {value}")
    
    # Example usage
    print("\nExample usage:")
    print("engine.index_repository('/path/to/repo', 'repo_name')")
    print("response = engine.query('What functions are available?')")
    print("print(response.answer)")


if __name__ == "__main__":
    main()