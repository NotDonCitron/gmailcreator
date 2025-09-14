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
        with tempfile.NamedTemporaryFile(mode='w', suffix='.yaml', delete=False) as f:
            f.write("""vector_store:
  provider: "chroma"
  collection_name: "test_collection"
  embedding_model: "all-MiniLM-L6-v2"
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
        engine = RAGEngine(temp_config)
        yield engine
        # Cleanup after tests
        if hasattr(engine, 'vector_store') and engine.vector_store:
            try:
                if hasattr(engine.vector_store, 'collection') and engine.vector_store.collection:
                    engine.vector_store.collection.delete()
            except:
                pass

    def test_initialization(self, temp_config):
        """Test RAGEngine initialization."""
        engine = RAGEngine(temp_config)

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

    def test_get_stats(self, rag_engine):
        """Test statistics retrieval."""
        stats = rag_engine.get_stats()

        assert isinstance(stats, dict)
        assert "total_documents" in stats
        assert "embedding_model" in stats
        assert "llm_provider" in stats
        assert "vector_store_type" in stats


if __name__ == '__main__':
    pytest.main([__file__])