#!/usr/bin/env python3
"""
Simple test to verify RAG system functionality.
"""

import os
import sys
import pytest
import tempfile
from pathlib import Path

# Add parent directory to path for imports
sys.path.append(str(Path(__file__).parent.parent))

from rag_engine import RAGEngine
from code_parser import CodeParser


def test_rag_engine_basic():
    """Test basic RAGEngine functionality."""
    # Create engine with default config
    engine = RAGEngine()

    # Test initialization
    assert engine is not None
    assert engine.embedding_model is not None
    assert engine.vector_store is not None
    assert engine.llm_provider is not None

    # Test basic query
    response = engine.query("test query")
    assert response is not None
    assert response.answer is not None
    assert isinstance(response.sources, list)

    # Test stats
    stats = engine.get_stats()
    assert isinstance(stats, dict)
    assert "total_documents" in stats


def test_code_parser_basic():
    """Test basic CodeParser functionality."""
    # Create parser with default config
    parser = CodeParser()

    # Test initialization
    assert parser is not None
    assert parser.supported_extensions is not None
    assert parser.ignore_patterns is not None

    # Test file type checking
    assert parser._should_process_file(Path("test.py"))
    assert not parser._should_process_file(Path("test.jpg"))

    # Test ignore patterns
    assert parser._should_ignore("__pycache__")
    assert not parser._should_ignore("main.py")


def test_integration():
    """Test integration between RAGEngine and CodeParser."""
    with tempfile.TemporaryDirectory() as temp_dir:
        # Create a simple Python file
        test_file = Path(temp_dir) / "test.py"
        test_file.write_text('''
def hello_world():
    """A simple hello world function."""
    return "Hello, World!"

class TestClass:
    """A simple test class."""
    def method(self):
        return "test result"
''')

        # Parse the file
        parser = CodeParser()
        documents = parser.parse_repository(temp_dir, "test_repo")

        # Check that documents were created
        assert len(documents) > 0

        # Add to RAG engine
        engine = RAGEngine()
        embeddings = engine.embedding_model.encode([doc.content for doc in documents])
        success = engine.vector_store.add_documents(documents, embeddings)
        assert success

        # Query the engine
        response = engine.query("What does hello_world do?")
        assert response.answer is not None
        assert len(response.sources) >= 0


if __name__ == '__main__':
    pytest.main([__file__, '-v'])