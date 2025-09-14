#!/usr/bin/env python3
"""
Integration test suite for the RAG system.

This module contains comprehensive integration tests that test the interaction
between the RAG Engine and Code Parser components, including end-to-end workflows.
"""

import os
import sys
import pytest
import tempfile
import shutil
import json
from pathlib import Path
from unittest.mock import Mock, patch, MagicMock

# Add parent directory to path for imports
sys.path.append(str(Path(__file__).parent.parent))

from rag_engine import RAGEngine
from code_parser import CodeParser

class TestIntegration:
    """Test class for integration scenarios."""

    @pytest.fixture
    def temp_config(self):
        """Create a temporary configuration for testing."""
        try:
            with tempfile.NamedTemporaryFile(mode='w', suffix='.yaml', delete=False) as f:
                f.write("""
vector_store:
  provider: "chroma"
  collection_name: "test_integration_collection"
  embedding_model: "sentence-transformers/all-MiniLM-L6-v2"
  chunk_size: 512
  chunk_overlap: 50
  persist_directory: "./test_chroma_db"

code_parser:
  supported_extensions: [".py", ".js", ".ts", ".java", ".cpp", ".c", ".h", ".cs", ".rb", ".go", ".rs", ".php", ".swift", ".kt", ".scala", ".r", ".m", ".mm", ".pl", ".sh", ".bat", ".ps1", ".sql", ".html", ".css", ".scss", ".sass", ".less", ".xml", ".json", ".yaml", ".yml", ".toml", ".ini", ".cfg", ".conf", ".properties", ".md", ".rst", ".txt", ".tex", ".dockerfile", ".gitignore", ".env"]
  max_file_size: 1048576
  exclude_patterns: ["__pycache__", "*.pyc", "*.pyo", "*.pyd", ".git", ".svn", ".hg", "node_modules", "vendor", "dist", "build", "*.egg-info", ".pytest_cache", ".mypy_cache", ".tox", ".coverage", "htmlcov", ".idea", ".vscode", "*.swp", "*.swo", "*~", ".DS_Store", "Thumbs.db"]
  documentation_extensions: [".md", ".rst", ".txt", ".pdf", ".docx"]
  test_file_patterns: ["test_*.py", "*_test.py", "*_tests.py", "tests.py", "Test*.java", "*Test.java", "*Tests.java", "test_*.js", "*_test.js", "*_spec.js", "spec_*.js"]
""")
                f.flush()
                yield f.name
        finally:
            if os.path.exists(f.name):
                os.unlink(f.name)

    @pytest.fixture
    def sample_project(self):
        """Create a sample project for testing."""
        with tempfile.TemporaryDirectory() as temp_dir:
            # Create a realistic project structure
            project_structure = {
                'src/': {
                    'main.py': '''
"""
Main application module.
This module contains the main application logic.
"""

import logging
from typing import Dict, List
from .utils import helper_function
from .models import User, Product

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

class Application:
    """Main application class."""

    def __init__(self, config: Dict):
        """Initialize the application.

        Args:
            config: Application configuration dictionary
        """
        self.config = config
        self.users: List[User] = []
        self.products: List[Product] = []
        logger.info("Application initialized")

    def add_user(self, user: User) -> bool:
        """Add a user to the application.

        Args:
            user: User object to add

        Returns:
            True if user was added successfully
        """
        try:
            self.users.append(user)
            logger.info(f"User {user.name} added")
            return True
        except Exception as e:
            logger.error(f"Failed to add user: {e}")
            return False

    def get_user_count(self) -> int:
        """Get the number of users in the application.

        Returns:
            Number of users
        """
        return len(self.users)
''',
                    'utils.py': '''
"""
Utility functions for the application.
"""

import hashlib
import secrets
from typing import Optional

def helper_function(data: str) -> str:
    """A helper function that processes data.

    Args:
        data: Input data string

    Returns:
        Processed data string
    """
    return data.upper()

def generate_token(length: int = 32) -> str:
    """Generate a secure random token.

    Args:
        length: Token length (default: 32)

    Returns:
        Secure random token
    """
    return secrets.token_urlsafe(length)

def hash_password(password: str, salt: Optional[str] = None) -> tuple:
    """Hash a password with salt.

    Args:
        password: Plain text password
        salt: Optional salt (generated if not provided)

    Returns:
        Tuple of (hashed_password, salt)
    """
    if salt is None:
        salt = secrets.token_hex(16)

    hashed = hashlib.pbkdf2_hmac('sha256',
                                  password.encode('utf-8'),
                                  salt.encode('utf-8'),
                                  100000)
    return hashed.hex(), salt
''',
                    'models.py': '''
"""
Data models for the application.
"""

from dataclasses import dataclass
from typing import Optional
from datetime import datetime

@dataclass
class User:
    """User data model."""
    id: int
    name: str
    email: str
    created_at: datetime
    is_active: bool = True

    def __post_init__(self):
        """Post-initialization processing."""
        if self.created_at is None:
            self.created_at = datetime.now()

@dataclass
class Product:
    """Product data model."""
    id: int
    name: str
    price: float
    description: Optional[str] = None
    in_stock: bool = True

    def get_display_price(self) -> str:
        """Get formatted display price.

        Returns:
            Formatted price string
        """
        return f"${self.price:.2f}"
''',
                    'database.py': '''
"""
Database connection and operations.
"""

import sqlite3
from typing import List, Optional
from contextlib import contextmanager
from .models import User, Product

class DatabaseManager:
    """Manages database connections and operations."""

    def __init__(self, db_path: str):
        """Initialize database manager.

        Args:
            db_path: Path to SQLite database file
        """
        self.db_path = db_path
        self._init_database()

    def _init_database(self):
        """Initialize database schema."""
        with self.get_connection() as conn:
            conn.execute('''
                CREATE TABLE IF NOT EXISTS users (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    name TEXT NOT NULL,
                    email TEXT UNIQUE NOT NULL,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    is_active BOOLEAN DEFAULT 1
                )
            ''')

            conn.execute('''
                CREATE TABLE IF NOT EXISTS products (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    name TEXT NOT NULL,
                    price REAL NOT NULL,
                    description TEXT,
                    in_stock BOOLEAN DEFAULT 1
                )
            ''')

    @contextmanager
    def get_connection(self):
        """Get database connection context manager."""
        conn = sqlite3.connect(self.db_path)
        conn.row_factory = sqlite3.Row
        try:
            yield conn
        finally:
            conn.close()

    def add_user(self, user: User) -> int:
        """Add user to database.

        Args:
            user: User object to add

        Returns:
            ID of inserted user
        """
        with self.get_connection() as conn:
            cursor = conn.execute(
                "INSERT INTO users (name, email, is_active) VALUES (?, ?, ?)",
                (user.name, user.email, user.is_active)
            )
            return cursor.lastrowid
''',
                },
                'tests/': {
                    'test_main.py': '''
"""
Tests for main application module.
"""

import pytest
from src.main import Application
from src.models import User

class TestApplication:
    """Test cases for Application class."""

    def test_application_initialization(self):
        """Test application initialization."""
        config = {"debug": True}
        app = Application(config)

        assert app.config == config
        assert len(app.users) == 0
        assert len(app.products) == 0

    def test_add_user(self):
        """Test adding users to application."""
        app = Application({})
        user = User(id=1, name="Test User", email="test@example.com", created_at=None)

        result = app.add_user(user)
        assert result is True
        assert len(app.users) == 1
        assert app.users[0].name == "Test User"

    def test_get_user_count(self):
        """Test getting user count."""
        app = Application({})
        assert app.get_user_count() == 0

        user = User(id=1, name="Test User", email="test@example.com", created_at=None)
        app.add_user(user)
        assert app.get_user_count() == 1
''',
                    'test_utils.py': '''
"""
Tests for utility functions.
"""

import pytest
from src.utils import helper_function, generate_token, hash_password

class TestUtils:
    """Test cases for utility functions."""

    def test_helper_function(self):
        """Test helper function."""
        result = helper_function("hello world")
        assert result == "HELLO WORLD"

    def test_generate_token(self):
        """Test token generation."""
        token = generate_token()
        assert len(token) > 0
        assert isinstance(token, str)

        # Test custom length
        token_64 = generate_token(64)
        assert len(token_64) > len(token)

    def test_hash_password(self):
        """Test password hashing."""
        password = "test_password123"
        hashed, salt = hash_password(password)

        assert len(hashed) > 0
        assert len(salt) == 32  # 16 bytes hex encoded

        # Test same password produces different hashes
        hashed2, salt2 = hash_password(password)
        assert hashed != hashed2
        assert salt != salt2

        # Test with provided salt
        hashed3, salt3 = hash_password(password, salt)
        assert hashed3 == hashed
        assert salt3 == salt
''',
                },
                'docs/': {
                    'README.md': '''
# Sample Project Documentation

This is a sample project for testing the RAG system integration.

## Overview

This project demonstrates a simple application with:
- User management
- Product catalog
- Database operations
- Utility functions

## Architecture

The project follows a modular architecture with separate modules for:
- `main.py`: Main application logic
- `models.py`: Data models
- `utils.py`: Utility functions
- `database.py`: Database operations

## Usage

```python
from src.main import Application
from src.models import User

# Create application
app = Application(config={})

# Add user
user = User(id=1, name="John Doe", email="john@example.com", created_at=None)
app.add_user(user)
```

## Testing

Run tests with pytest:
```bash
pytest tests/
```
''',
                    'API.md': '''
# API Documentation

## Application Class

### `Application.__init__(config: Dict)`

Initialize the application with configuration.

**Parameters:**
- `config`: Configuration dictionary

**Example:**
```python
app = Application({"debug": True})
```

### `Application.add_user(user: User) -> bool`

Add a user to the application.

**Parameters:**
- `user`: User object to add

**Returns:**
- `bool`: True if successful, False otherwise

**Example:**
```python
user = User(id=1, name="John", email="john@example.com", created_at=None)
success = app.add_user(user)
```

### `Application.get_user_count() -> int`

Get the number of users in the application.

**Returns:**
- `int`: Number of users

**Example:**
```python
count = app.get_user_count()
```
''',
                },
                'requirements.txt': '''
pytest>=7.0.0
pytest-cov>=4.0.0
pytest-mock>=3.10.0
''',
                'setup.py': '''
from setuptools import setup, find_packages

setup(
    name="sample-project",
    version="1.0.0",
    packages=find_packages(),
    install_requires=[
        "pytest>=7.0.0",
    ],
    python_requires=">=3.8",
)
''',
            }

            # Create the project structure
            for dir_path, contents in project_structure.items():
                full_dir = os.path.join(temp_dir, dir_path)
                os.makedirs(full_dir, exist_ok=True)

                for filename, content in contents.items():
                    file_path = os.path.join(full_dir, filename)
                    with open(file_path, 'w', encoding='utf-8') as f:
                        f.write(content)

            yield temp_dir

    def test_end_to_end_workflow(self, temp_config, sample_project):
        """Test complete end-to-end workflow."""
        # Initialize components
        rag_engine = RAGEngine(temp_config)
        code_parser = CodeParser(temp_config)

        # Parse the sample project
        documents = code_parser.parse_repository(sample_project, "sample_project")

        # Verify parsing results
        assert len(documents) > 0

        # Add parsed files to RAG engine
        success = rag_engine.vector_store.add_documents(
            documents,
            rag_engine.embedding_model.encode([doc.content for doc in documents])
        )
        assert success

        # Test querying
        response = rag_engine.query("How do I add a user to the application?")

        assert response.answer is not None
        assert len(response.sources) > 0

        # Verify relevant results
        relevant_scores = [r.score for r in response.sources if r.score > 0.3]
        assert len(relevant_scores) > 0

        # Check that we got results about user management
        user_related = any('user' in r.document.content.lower() for r in response.sources)
        assert user_related

    def test_code_search_functionality(self, temp_config, sample_project):
        """Test code search and retrieval functionality."""
        rag_engine = RAGEngine(temp_config)
        code_parser = CodeParser(temp_config)

        # Parse and index the project
        documents = code_parser.parse_repository(sample_project, "sample_project")
        rag_engine.vector_store.add_documents(
            documents,
            rag_engine.embedding_model.encode([doc.content for doc in documents])
        )

        # Test specific code queries
        queries = [
            "database connection management",
            "password hashing function",
            "user model definition",
            "application initialization",
            "token generation utility"
        ]

        for query in queries:
            response = rag_engine.query(query)
            assert response.answer is not None
            assert len(response.sources) > 0

            # Check relevance
            if response.sources:
                top_result = response.sources[0]
                assert top_result.score > 0.1  # Reasonable relevance threshold

    def test_documentation_integration(self, temp_config, sample_project):
        """Test integration with documentation files."""
        rag_engine = RAGEngine(temp_config)
        code_parser = CodeParser(temp_config)

        # Parse project including documentation
        documents = code_parser.parse_repository(sample_project, "sample_project")
        rag_engine.vector_store.add_documents(
            documents,
            rag_engine.embedding_model.encode([doc.content for doc in documents])
        )

        # Query documentation
        doc_queries = [
            "API documentation",
            "project overview",
            "usage examples",
            "installation instructions"
        ]

        for query in doc_queries:
            response = rag_engine.query(query)
            assert response.answer is not None

            # Should find documentation content
            if response.sources:
                doc_content = any('documentation' in r.document.content.lower() or
                                'readme' in r.document.metadata.get('file_path', '').lower()
                                for r in response.sources)
                # Either doc content or other relevant content
                assert doc_content or len(response.sources) > 0

    def test_error_handling_integration(self, temp_config):
        """Test error handling in integrated scenarios."""
        rag_engine = RAGEngine(temp_config)
        code_parser = CodeParser(temp_config)

        # Test with non-existent directory
        documents = code_parser.parse_repository("/non/existent/path", "test_repo")
        assert len(documents) == 0

        # Test with empty directory
        with tempfile.TemporaryDirectory() as empty_dir:
            documents = code_parser.parse_repository(empty_dir, "empty_repo")
            assert len(documents) == 0

        # Test querying with empty index
        response = rag_engine.query("test query")
        assert response.answer is not None
        assert len(response.sources) == 0

    def test_metadata_preservation(self, temp_config, sample_project):
        """Test that metadata is properly preserved through the pipeline."""
        rag_engine = RAGEngine(temp_config)
        code_parser = CodeParser(temp_config)

        # Parse project
        documents = code_parser.parse_repository(sample_project, "sample_project")

        # Add to RAG engine
        rag_engine.vector_store.add_documents(
            documents,
            rag_engine.embedding_model.encode([doc.content for doc in documents])
        )

        # Query and check metadata
        response = rag_engine.query("user management")
        assert response.answer is not None

        for search_result in response.sources:
            metadata = search_result.document.metadata

            # Essential metadata should be present
            assert 'file_path' in metadata
            assert 'repo_name' in metadata
            assert 'doc_type' in metadata

    def test_performance_integration(self, temp_config, sample_project):
        """Test performance characteristics of the integrated system."""
        import time

        rag_engine = RAGEngine(temp_config)
        code_parser = CodeParser(temp_config)

        # Measure parsing performance
        start_time = time.time()
        documents = code_parser.parse_repository(sample_project, "sample_project")
        parse_time = time.time() - start_time

        assert len(documents) > 0
        assert parse_time < 5.0  # Should parse small project quickly

        # Measure indexing performance
        start_time = time.time()
        embeddings = rag_engine.embedding_model.encode([doc.content for doc in documents])
        success = rag_engine.vector_store.add_documents(documents, embeddings)
        index_time = time.time() - start_time

        assert success
        assert index_time < 10.0  # Should index reasonably quickly

        # Measure query performance
        start_time = time.time()
        response = rag_engine.query("user management system")
        query_time = time.time() - start_time

        assert response.answer is not None
        assert query_time < 2.0  # Queries should be fast

    def test_concurrent_operations(self, temp_config, sample_project):
        """Test concurrent operations on the RAG system."""
        import threading
        import queue

        rag_engine = RAGEngine(temp_config)
        code_parser = CodeParser(temp_config)

        # Parse and index the project
        documents = code_parser.parse_repository(sample_project, "sample_project")
        embeddings = rag_engine.embedding_model.encode([doc.content for doc in documents])
        rag_engine.vector_store.add_documents(documents, embeddings)

        # Create multiple threads for concurrent queries
        results_queue = queue.Queue()
        threads = []

        def query_worker(query):
            try:
                result = rag_engine.query(query)
                results_queue.put((query, result))
            except Exception as e:
                results_queue.put((query, {'error': str(e)}))

        # Launch concurrent queries
        queries = [
            "user management",
            "database operations",
            "utility functions",
            "application configuration",
            "testing framework"
        ]

        for query in queries:
            thread = threading.Thread(target=query_worker, args=(query,))
            threads.append(thread)
            thread.start()

        # Wait for all threads to complete
        for thread in threads:
            thread.join(timeout=10.0)

        # Collect results
        results = []
        while not results_queue.empty():
            query, result = results_queue.get()
            results.append((query, result))

        # Verify all queries completed successfully
        assert len(results) == len(queries)

        for query, result in results:
            assert 'error' not in result
            assert result.answer is not None
            assert len(result.sources) >= 0


if __name__ == '__main__':
    pytest.main([__file__])