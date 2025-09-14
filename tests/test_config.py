#!/usr/bin/env python3
"""
Test configuration and utilities for the RAG system test suite.

This module provides shared configuration, fixtures, and utility functions
used across the test suite.
"""

import os
import sys
import tempfile
import shutil
import json
import yaml
from pathlib import Path
from unittest.mock import Mock, MagicMock, patch

# Add parent directory to path for imports
sys.path.append(str(Path(__file__).parent.parent))

# Test configuration
TEST_CONFIG = {
    'vector_store': {
        'provider': 'chroma',
        'collection_name': 'test_collection',
        'embedding_model': 'sentence-transformers/all-MiniLM-L6-v2',
        'chunk_size': 512,
        'chunk_overlap': 50,
        'persist_directory': './test_chroma_db'
    },
    'code_parser': {
        'supported_extensions': [
            '.py', '.js', '.ts', '.java', '.cpp', '.c', '.h', '.cs', '.rb', '.go', '.rs',
            '.php', '.swift', '.kt', '.scala', '.r', '.m', '.mm', '.pl', '.sh', '.bat',
            '.ps1', '.sql', '.html', '.css', '.scss', '.sass', '.less', '.xml', '.json',
            '.yaml', '.yml', '.toml', '.ini', '.cfg', '.conf', '.properties', '.md',
            '.rst', '.txt', '.tex', '.dockerfile', '.gitignore', '.env'
        ],
        'max_file_size': 1048576,
        'exclude_patterns': [
            '__pycache__', '*.pyc', '*.pyo', '*.pyd', '.git', '.svn', '.hg',
            'node_modules', 'vendor', 'dist', 'build', '*.egg-info', '.pytest_cache',
            '.mypy_cache', '.tox', '.coverage', 'htmlcov', '.idea', '.vscode',
            '*.swp', '*.swo', '*~', '.DS_Store', 'Thumbs.db'
        ],
        'documentation_extensions': ['.md', '.rst', '.txt', '.pdf', '.docx'],
        'test_file_patterns': [
            'test_*.py', '*_test.py', '*_tests.py', 'tests.py', 'Test*.java',
            '*Test.java', '*Tests.java', 'test_*.js', '*_test.js', '*_spec.js', 'spec_*.js'
        ]
    }
}

# Sample code snippets for testing
SAMPLE_PYTHON_CODE = '''
class UserManager:
    """Manages user operations in the application."""
    
    def __init__(self, database):
        self.database = database
        self.users = {}
    
    def add_user(self, user_id, user_data):
        """Add a new user to the system."""
        if user_id in self.users:
            raise ValueError(f"User {user_id} already exists")
        
        self.users[user_id] = user_data
        self.database.insert('users', {'id': user_id, **user_data})
        return True
    
    def get_user(self, user_id):
        """Retrieve user information by ID."""
        return self.users.get(user_id)
    
    def update_user(self, user_id, updates):
        """Update existing user data."""
        if user_id not in self.users:
            raise KeyError(f"User {user_id} not found")
        
        self.users[user_id].update(updates)
        self.database.update('users', {'id': user_id}, updates)
        return True

def hash_password(password, salt=None):
    """Hash a password with optional salt."""
    import hashlib
    import secrets
    
    if salt is None:
        salt = secrets.token_hex(16)
    
    password_with_salt = f"{password}{salt}"
    hashed = hashlib.sha256(password_with_salt.encode()).hexdigest()
    
    return hashed, salt
'''

SAMPLE_JAVASCRIPT_CODE = '''
class DatabaseManager {
    constructor(connectionString) {
        this.connectionString = connectionString;
        this.connection = null;
    }
    
    async connect() {
        try {
            this.connection = await createConnection(this.connectionString);
            console.log('Database connected successfully');
            return true;
        } catch (error) {
            console.error('Database connection failed:', error);
            throw error;
        }
    }
    
    async query(sql, params = []) {
        if (!this.connection) {
            throw new Error('Database not connected');
        }
        
        try {
            const result = await this.connection.query(sql, params);
            return result;
        } catch (error) {
            console.error('Query execution failed:', error);
            throw error;
        }
    }
    
    async disconnect() {
        if (this.connection) {
            await this.connection.close();
            this.connection = null;
        }
    }
}

module.exports = DatabaseManager;
'''

SAMPLE_DOCUMENTATION = '''
# Project Documentation

## Overview

This project provides a comprehensive solution for managing user data and database operations.

## Features

- User management with CRUD operations
- Secure password hashing
- Database connection pooling
- Error handling and logging
- RESTful API endpoints

## Installation

```bash
npm install
# or
pip install -r requirements.txt
```

## Usage

### Python Example
```python
from user_manager import UserManager
from database import Database

db = Database("postgresql://localhost/mydb")
user_manager = UserManager(db)

user_manager.add_user(1, {"name": "John Doe", "email": "john@example.com"})
```

### JavaScript Example
```javascript
const DatabaseManager = require('./database-manager');
const db = new DatabaseManager('postgresql://localhost/mydb');

await db.connect();
const users = await db.query('SELECT * FROM users');
```

## API Reference

See [API.md](API.md) for detailed API documentation.
'''

def create_temp_config_file(config_data=None):
    """Create a temporary configuration file."""
    if config_data is None:
        config_data = TEST_CONFIG
    
    with tempfile.NamedTemporaryFile(mode='w', suffix='.yaml', delete=False) as f:
        yaml.dump(config_data, f)
        return f.name

def create_temp_project_structure():
    """Create a temporary project structure for testing."""
    temp_dir = tempfile.mkdtemp()
    
    # Create sample project structure
    project_files = {
        'src/': {
            'main.py': SAMPLE_PYTHON_CODE,
            'utils.py': '''
def validate_email(email):
    """Validate email address format."""
    import re
    pattern = r'^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\\.[a-zA-Z]{2,}$'
    return re.match(pattern, email) is not None

def format_date(date_obj):
    """Format date object to string."""
    return date_obj.strftime('%Y-%m-%d %H:%M:%S')
''',
            'models.py': '''
from dataclasses import dataclass
from datetime import datetime

@dataclass
class User:
    id: int
    name: str
    email: str
    created_at: datetime = None

@dataclass
class Product:
    id: int
    name: str
    price: float
    description: str = ""
''',
            'database.py': '''
import sqlite3
from contextlib import contextmanager

class Database:
    def __init__(self, db_path):
        self.db_path = db_path
    
    @contextmanager
    def get_connection(self):
        conn = sqlite3.connect(self.db_path)
        try:
            yield conn
        finally:
            conn.close()
    
    def execute_query(self, query, params=None):
        with self.get_connection() as conn:
            cursor = conn.cursor()
            if params:
                cursor.execute(query, params)
            else:
                cursor.execute(query)
            return cursor.fetchall()
''',
        },
        'tests/': {
            'test_main.py': '''
import pytest
from src.main import UserManager
from src.models import User

class TestUserManager:
    def test_add_user(self):
        manager = UserManager(None)
        result = manager.add_user(1, {"name": "Test User"})
        assert result is True
    
    def test_get_user(self):
        manager = UserManager(None)
        manager.users = {1: {"name": "Test User"}}
        user = manager.get_user(1)
        assert user["name"] == "Test User"
''',
            'test_utils.py': '''
import pytest
from datetime import datetime
from src.utils import validate_email, format_date

class TestUtils:
    def test_validate_email_valid(self):
        assert validate_email("test@example.com") is True
    
    def test_validate_email_invalid(self):
        assert validate_email("invalid-email") is False
    
    def test_format_date(self):
        date_obj = datetime(2023, 1, 1, 12, 0, 0)
        formatted = format_date(date_obj)
        assert formatted == "2023-01-01 12:00:00"
''',
        },
        'docs/': {
            'README.md': SAMPLE_DOCUMENTATION,
            'API.md': '''
# API Documentation

## Endpoints

### GET /users
Retrieve all users.

**Response:**
```json
[
    {
        "id": 1,
        "name": "John Doe",
        "email": "john@example.com"
    }
]
```

### POST /users
Create a new user.

**Request Body:**
```json
{
    "name": "Jane Doe",
    "email": "jane@example.com"
}
```

**Response:**
```json
{
    "id": 2,
    "name": "Jane Doe",
    "email": "jane@example.com"
}
```
''',
        },
        'requirements.txt': '''
pytest>=7.0.0
pytest-cov>=4.0.0
sqlalchemy>=1.4.0
''',
        'setup.py': '''
from setuptools import setup, find_packages

setup(
    name="sample-project",
    version="1.0.0",
    packages=find_packages(),
    install_requires=[
        "pytest>=7.0.0",
        "sqlalchemy>=1.4.0",
    ],
    python_requires=">=3.8",
)
''',
    }
    
    # Create the project structure
    for dir_path, files in project_files.items():
        full_dir = os.path.join(temp_dir, dir_path)
        os.makedirs(full_dir, exist_ok=True)
        
        for filename, content in files.items():
            file_path = os.path.join(full_dir, filename)
            with open(file_path, 'w', encoding='utf-8') as f:
                f.write(content)
    
    return temp_dir

def create_mock_vector_store():
    """Create a mock vector store for testing."""
    mock_store = Mock()
    mock_store.add_documents = Mock(return_value={"status": "success", "ids": ["doc1", "doc2"]})
    mock_store.query = Mock(return_value={
        "status": "success",
        "results": [
            {
                "content": "Sample content about user management",
                "metadata": {"filename": "user_manager.py", "file_type": "code"},
                "score": 0.85
            }
        ]
    })
    mock_store.delete = Mock(return_value={"status": "success"})
    mock_store.update = Mock(return_value={"status": "success"})
    return mock_store

def create_mock_embedding_model():
    """Create a mock embedding model for testing."""
    mock_model = Mock()
    mock_model.encode = Mock(return_value=[0.1, 0.2, 0.3, 0.4, 0.5])
    return mock_model

def create_mock_chroma_client():
    """Create a mock ChromaDB client for testing."""
    mock_client = Mock()
    mock_collection = Mock()
    
    # Mock collection methods
    mock_collection.add = Mock(return_value=None)
    mock_collection.query = Mock(return_value={
        'ids': [['doc1', 'doc2']],
        'documents': [['Content 1', 'Content 2']],
        'metadatas': [[{'filename': 'test.py'}, {'filename': 'test2.py'}]],
        'distances': [[0.1, 0.2]]
    })
    mock_collection.update = Mock(return_value=None)
    mock_collection.delete = Mock(return_value=None)
    
    # Mock client methods
    mock_client.get_or_create_collection = Mock(return_value=mock_collection)
    mock_client.delete_collection = Mock(return_value=None)
    
    return mock_client, mock_collection

def cleanup_temp_files(*paths):
    """Clean up temporary files and directories."""
    for path in paths:
        try:
            if os.path.isfile(path):
                os.unlink(path)
            elif os.path.isdir(path):
                shutil.rmtree(path)
        except Exception as e:
            print(f"Warning: Failed to cleanup {path}: {e}")

def assert_valid_document(document):
    """Assert that a document has valid structure."""
    required_fields = ['content', 'metadata']
    for field in required_fields:
        assert field in document, f"Document missing required field: {field}"
    
    # Check metadata structure
    metadata = document['metadata']
    assert 'filename' in metadata
    assert 'file_path' in metadata
    assert 'file_type' in metadata
    
    # Content should be non-empty string
    assert isinstance(document['content'], str)
    assert len(document['content']) > 0

def assert_valid_search_result(result):
    """Assert that a search result has valid structure."""
    required_fields = ['content', 'metadata', 'score']
    for field in required_fields:
        assert field in result, f"Search result missing required field: {field}"
    
    # Score should be between 0 and 1
    assert 0 <= result['score'] <= 1
    
    # Content should be non-empty string
    assert isinstance(result['content'], str)
    assert len(result['content']) > 0

# Pytest fixtures (if using pytest)
try:
    import pytest
    
    @pytest.fixture
    def temp_config_file():
        """Create a temporary configuration file for testing."""
        config_path = create_temp_config_file()
        yield config_path
        cleanup_temp_files(config_path)
    
    @pytest.fixture
    def temp_project():
        """Create a temporary project structure for testing."""
        project_path = create_temp_project_structure()
        yield project_path
        cleanup_temp_files(project_path)
    
    @pytest.fixture
    def mock_vector_store():
        """Provide a mock vector store."""
        return create_mock_vector_store()
    
    @pytest.fixture
    def mock_embedding_model():
        """Provide a mock embedding model."""
        return create_mock_embedding_model()
    
    @pytest.fixture
    def mock_chroma_client():
        """Provide a mock ChromaDB client and collection."""
        return create_mock_chroma_client()

except ImportError:
    # pytest not available, skip fixtures
    pass

if __name__ == '__main__':
    # Test the utilities
    print("Testing utility functions...")
    
    # Test config creation
    config_path = create_temp_config_file()
    print(f"Created config file: {config_path}")
    
    # Test project creation
    project_path = create_temp_project_structure()
    print(f"Created project structure: {project_path}")
    
    # Test mock creation
    mock_store = create_mock_vector_store()
    mock_model = create_mock_embedding_model()
    print("Created mock objects")
    
    # Cleanup
    cleanup_temp_files(config_path, project_path)
    print("Cleanup completed")
    
    print("All utility functions working correctly!")