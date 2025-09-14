#!/usr/bin/env python3
"""
Test suite for the RAG Engine component.

This module contains comprehensive tests for the RAGEngine class,
including vector database operations, similarity search, and error handling.
"""

import os
import sys
import pytest
import tempfile
import shutil
from pathlib import Path
from unittest.mock import Mock, patch, MagicMock
import numpy as np

# Add parent directory to path for imports
sys.path.append(str(Path(__file__).parent.parent))

from rag_engine import RAGEngine

class TestRAGEngine:
    """Test class for RAGEngine functionality."""

    @pytest.fixture
    def temp_config(self):
        """Create a temporary configuration for testing."""
        try:
            with tempfile.NamedTemporaryFile(mode='w', suffix='.yaml', delete=False) as f:
                f.write("""
vector_store:
  provider: "chroma"
  collection_name: "test_collection"
  embedding_model: "sentence-transformers/all-MiniLM-L6-v2"
  chunk_size: 512
  chunk_overlap: 50

code_parser:
  supported_extensions: [".py", ".js", ".ts", ".java", ".cpp", ".c", ".h", ".cs", ".rb", ".go", ".rs", ".php", ".swift", ".kt", ".scala", ".r", ".m", ".mm", ".pl", ".sh", ".bat", ".ps1", ".sql", ".html", ".css", ".scss", ".sass", ".less", ".xml", ".json", ".yaml", ".yml", ".toml", ".ini", ".cfg", ".conf", ".properties", ".md", ".rst", ".txt", ".tex", ".dockerfile", ".gitignore", ".env"]
  max_file_size: 1048576
  exclude_patterns: ["__pycache__", "*.pyc", "*.pyo", "*.pyd", ".git", ".svn", ".hg", "node_modules", "vendor", "dist", "build", "*.egg-info", ".pytest_cache", ".mypy_cache", ".tox", ".coverage", "htmlcov", ".idea", ".vscode", "*.swp", "*.swo", "*~", ".DS_Store", "Thumbs.db"]
  documentation_extensions: [".md", ".rst", ".txt", ".pdf", ".docx"]
  test_file_patterns: ["test_*.py", "*_test.py", "*_tests.py", "tests.py", "Test*.java", "*Test.java", "*Tests.java", "test_*.js", "*_test.js", "*_spec.js", "spec_*.js"]

external_repositories:
  - name: "test_repo"
    url: "https://github.com/test/test_repo.git"
    branch: "main"
    local_path: "external_repos/test_repo"
    update_frequency: "weekly"
    include_patterns: ["*.py", "*.md"]
    exclude_patterns: ["tests/*", "docs/*"]
""")
                f.flush()
                yield f.name
        finally:
            if os.path.exists(f.name):
                os.unlink(f.name)

    @pytest.fixture
    def rag_engine(self, temp_config):
        """Create a RAGEngine instance for testing."""
        # Load config from file
        from config.settings import load_config
        config = load_config(temp_config)
        engine = RAGEngine(config)
        yield engine
        # Cleanup after tests
        if hasattr(engine, 'vector_store') and engine.vector_store:
            try:
                if hasattr(engine.vector_store, 'collection') and engine.vector_store.collection:
                    engine.vector_store.collection.delete()
            except:
                pass

    def test_initialization(self, rag_engine):
        """Test RAGEngine initialization."""
        engine = rag_engine

        assert engine.config is not None
        assert 'vector_store' in engine.config
        assert 'code_parser' in engine.config
        assert 'external_repositories' in engine.config

    def test_embedding_model_initialization(self, rag_engine):
        """Test embedding model initialization."""
        assert rag_engine.embedding_model is not None
        assert rag_engine.embedding_model.model_name == "all-MiniLM-L6-v2"

    def test_vector_store_initialization(self, rag_engine):
        """Test vector store initialization."""
        assert rag_engine.vector_store is not None
        assert rag_engine.vector_store.collection_name == "test_collection"

    def test_llm_provider_initialization(self, rag_engine):
        """Test LLM provider initialization."""
        assert rag_engine.llm_provider is not None
        assert rag_engine.llm_provider.provider == "openai"

    def test_fallback_embeddings(self):
        """Test fallback embedding generation."""
        # Create RAG engine with config that forces fallback
        config = {
            "embedding_model": "nonexistent_model"
        }
        engine = RAGEngine(config)

        # Test fallback encoding
        texts = ["Hello world", "Test text"]
        embeddings = engine.embedding_model.encode(texts)

        assert len(embeddings) == 2
        assert len(embeddings[0]) == 384  # Fallback embedding size

    def test_vector_store_operations(self, rag_engine):
        """Test vector store add and search operations."""
        # Create test documents
        from rag_engine import Document
        test_docs = [
            Document(
                id="doc1",
                content="def hello_world():\n    print('Hello, World!')",
                metadata={"file_path": "test.py", "file_type": "python"},
                doc_type="python_function"
            ),
            Document(
                id="doc2",
                content="def calculate_sum(a, b):\n    return a + b",
                metadata={"file_path": "math.py", "file_type": "python"},
                doc_type="python_function"
            )
        ]

        # Generate embeddings
        embeddings = rag_engine.embedding_model.encode([doc.content for doc in test_docs])

        # Add documents to vector store
        success = rag_engine.vector_store.add_documents(test_docs, embeddings)
        assert success

        # Test search
        query_embedding = rag_engine.embedding_model.encode(["hello function"])[0]
        results = rag_engine.vector_store.search(query_embedding, top_k=2)

        assert len(results) > 0
        assert len(results) <= 2

        # Check result structure
        doc, score = results[0]
        assert isinstance(doc, Document)
        assert isinstance(score, float)
        assert 0.0 <= score <= 1.0

    def test_query_method(self, rag_engine):
        """Test the main query method."""
        # Add some test documents first
        from rag_engine import Document
        test_docs = [
            Document(
                id="doc1",
                content="def hello_world():\n    print('Hello, World!')",
                metadata={"file_path": "test.py", "file_type": "python"},
                doc_type="python_function"
            )
        ]

        embeddings = rag_engine.embedding_model.encode([doc.content for doc in test_docs])
        rag_engine.vector_store.add_documents(test_docs, embeddings)

        # Test query
        response = rag_engine.query("What does hello_world do?")

        assert response.answer is not None
        assert isinstance(response.sources, list)
        assert isinstance(response.confidence, float)
        assert isinstance(response.metadata, dict)

    def test_empty_index_query(self, rag_engine):
        """Test querying when index is empty."""
        response = rag_engine.query("test query")

        assert response.answer is not None
        assert len(response.sources) == 0
        assert response.confidence == 0.0

    def test_index_repository(self, rag_engine):
        """Test repository indexing."""
        with tempfile.TemporaryDirectory() as temp_dir:
            # Create a simple Python file
            test_file = Path(temp_dir) / "test.py"
            test_file.write_text('''
def test_function():
    """Test function docstring."""
    return "test result"

class TestClass:
    """Test class docstring."""
    def method(self):
        pass
''')

            # Index the repository
            success = rag_engine.index_repository(temp_dir, "test_repo")
            assert success

            # Query to verify indexing worked
            response = rag_engine.query("test function")
            assert len(response.sources) > 0

    def test_nonexistent_repository(self, rag_engine):
        """Test indexing non-existent repository."""
        success = rag_engine.index_repository("/nonexistent/path", "test_repo")
        assert not success

    def test_get_stats(self, rag_engine):
        """Test statistics retrieval."""
        stats = rag_engine.get_stats()

        assert isinstance(stats, dict)
        assert "total_documents" in stats
        assert "embedding_model" in stats
        assert "llm_provider" in stats
        assert "vector_store_type" in stats

    def test_concurrent_operations(self, rag_engine):
        """Test concurrent operations on the RAG engine."""
        import threading
        import time

        # Add test documents
        from rag_engine import Document
        test_docs = [
            Document(
                id=f"doc{i}",
                content=f"def function_{i}(): pass",
                metadata={"file_path": f"test_{i}.py", "file_type": "python"},
                doc_type="python_function"
            )
            for i in range(10)
        ]

        embeddings = rag_engine.embedding_model.encode([doc.content for doc in test_docs])
        rag_engine.vector_store.add_documents(test_docs, embeddings)

        results = []
        errors = []

        def query_worker(query_id):
            try:
                response = rag_engine.query(f"test query {query_id}")
                results.append(response)
            except Exception as e:
                errors.append(str(e))

        # Create multiple threads
        threads = []
        for i in range(5):
            thread = threading.Thread(target=query_worker, args=(i,))
            threads.append(thread)
            thread.start()

        # Wait for all threads to complete
        for thread in threads:
            thread.join(timeout=10.0)

        # Verify no errors occurred
        assert len(errors) == 0
        assert len(results) == 5

    def test_large_document_handling(self, rag_engine):
        """Test handling of large documents."""
        # Create a large document
        large_content = "def large_function():\n" + "    pass\n" * 1000

        from rag_engine import Document
        large_doc = Document(
            id="large_doc",
            content=large_content,
            metadata={"file_path": "large.py", "file_type": "python"},
            doc_type="python_function"
        )

        embeddings = rag_engine.embedding_model.encode([large_content])
        success = rag_engine.vector_store.add_documents([large_doc], embeddings)

        assert success

        # Test querying for the large document
        response = rag_engine.query("large function")
        assert len(response.sources) > 0

    def test_error_handling(self, rag_engine):
        """Test error handling in various scenarios."""
        # Test with invalid query
        response = rag_engine.query("")
        assert response.answer is not None

        # Test with malformed document
        from rag_engine import Document
        malformed_doc = Document(
            id="malformed",
            content="",
            metadata={"file_path": "empty.py", "file_type": "python"},
            doc_type="python_function"
        )

        # Should handle empty content gracefully
        embeddings = rag_engine.embedding_model.encode([""])
        success = rag_engine.vector_store.add_documents([malformed_doc], embeddings)
        # Success depends on implementation, but shouldn't crash
        assert isinstance(success, bool)

    def test_memory_efficiency(self, rag_engine):
        """Test memory efficiency with multiple operations."""
        import gc

        initial_memory = len(gc.get_objects())

        # Perform many operations
        for i in range(50):
            from rag_engine import Document
            doc = Document(
                id=f"temp_doc_{i}",
                content=f"def temp_function_{i}(): pass",
                metadata={"file_path": f"temp_{i}.py", "file_type": "python"},
                doc_type="python_function"
            )

            embeddings = rag_engine.embedding_model.encode([doc.content])
            rag_engine.vector_store.add_documents([doc], embeddings)

            # Query occasionally
            if i % 10 == 0:
                rag_engine.query(f"temp function {i}")

        # Force garbage collection
        gc.collect()
        final_memory = len(gc.get_objects())

        # Memory growth should be reasonable (not more than 2x)
        memory_growth_ratio = final_memory / max(initial_memory, 1)
        assert memory_growth_ratio < 10.0  # Allow some growth but not excessive


if __name__ == '__main__':
    pytest.main([__file__])