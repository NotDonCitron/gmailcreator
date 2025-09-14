#!/usr/bin/env python3
"""
Test suite for the Code Parser component.

This module contains comprehensive tests for the CodeParser class,
including file parsing, metadata extraction, and error handling.
"""

import os
import sys
import pytest
import tempfile
import shutil
from pathlib import Path
from unittest.mock import Mock, patch, MagicMock

# Add parent directory to path for imports
sys.path.append(str(Path(__file__).parent.parent))

from code_parser import CodeParser

class TestCodeParser:
    """Test class for CodeParser functionality."""

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
""")
                f.flush()
                yield f.name
        finally:
            if os.path.exists(f.name):
                os.unlink(f.name)

    @pytest.fixture
    def code_parser(self, temp_config):
        """Create a CodeParser instance for testing."""
        parser = CodeParser(temp_config)
        yield parser

    def test_initialization(self, temp_config):
        """Test CodeParser initialization."""
        parser = CodeParser(temp_config)

        assert parser.config is not None
        assert 'code_parser' in parser.config
        assert 'supported_extensions' in parser.config['code_parser']

    def test_supported_extensions(self, code_parser):
        """Test file extension support checking."""
        # Test supported extensions
        supported_files = [
            'test.py', 'script.js', 'app.ts', 'Main.java',
            'program.cpp', 'header.h', 'style.css', 'config.json',
            'README.md', 'requirements.txt', 'Dockerfile'
        ]

        for filename in supported_files:
            assert code_parser._should_process_file(Path(filename))

        # Test unsupported extensions
        unsupported_files = [
            'image.jpg', 'document.pdf', 'archive.zip',
            'video.mp4', 'audio.mp3', 'binary.exe'
        ]

        for filename in unsupported_files:
            assert not code_parser._should_process_file(Path(filename))

    def test_ignore_patterns(self, code_parser):
        """Test ignore pattern functionality."""
        # Test ignored patterns
        ignored_names = [
            '__pycache__', '.git', 'node_modules', 'venv',
            'test_file.pyc', 'module.pyo', 'script.pyd'
        ]

        for name in ignored_names:
            assert code_parser._should_ignore(name)

        # Test non-ignored names
        not_ignored_names = [
            'main.py', 'utils.js', 'app.ts', 'README.md'
        ]

        for name in not_ignored_names:
            assert not code_parser._should_ignore(name)

    def test_parse_python_file(self, code_parser):
        """Test Python file parsing."""
        # Create a test Python file
        python_content = '''
"""
Test module for parsing.
"""

def test_function(param1: str, param2: int = 10) -> bool:
    """A test function with parameters and return type."""
    return param1 and param2 > 0

class TestClass:
    """A test class with methods."""

    def __init__(self, name: str):
        self.name = name

    def method_one(self) -> str:
        """First method."""
        return self.name

    def method_two(self, value: int) -> int:
        """Second method."""
        return value * 2
'''

        with tempfile.NamedTemporaryFile(mode='w', suffix='.py', delete=False) as f:
            f.write(python_content)
            f.flush()

            try:
                documents = code_parser.parse_file(Path(f.name), Path(f.name).parent, "test_repo")

                # Should return multiple documents (file, functions, classes, methods)
                assert len(documents) > 1

                # Check that we have the main file document
                file_docs = [doc for doc in documents if doc.doc_type == "python_file"]
                assert len(file_docs) == 1

                # Check function documents
                func_docs = [doc for doc in documents if doc.doc_type == "python_function"]
                assert len(func_docs) >= 1

                # Check class documents
                class_docs = [doc for doc in documents if doc.doc_type == "python_class"]
                assert len(class_docs) >= 1

                # Check method documents
                method_docs = [doc for doc in documents if doc.doc_type == "python_method"]
                assert len(method_docs) >= 2

            finally:
                os.unlink(f.name)

    def test_parse_generic_file(self, code_parser):
        """Test generic file parsing."""
        # Create a test generic file
        generic_content = '''
# Generic configuration file
setting1 = value1
setting2 = value2

[section1]
key1 = value1
key2 = value2

[section2]
key3 = value3
'''

        with tempfile.NamedTemporaryFile(mode='w', suffix='.conf', delete=False) as f:
            f.write(generic_content)
            f.flush()

            try:
                documents = code_parser.parse_file(Path(f.name), Path(f.name).parent, "test_repo")

                # Should return one document for generic files
                assert len(documents) == 1
                assert documents[0].doc_type == "generic_file"

                # Check metadata
                metadata = documents[0].metadata
                assert 'file_path' in metadata
                assert 'total_lines' in metadata
                assert 'code_lines' in metadata
                assert 'comment_lines' in metadata
                assert 'empty_lines' in metadata

            finally:
                os.unlink(f.name)

    def test_parse_repository(self, code_parser):
        """Test repository parsing."""
        with tempfile.TemporaryDirectory() as temp_dir:
            # Create a simple repository structure
            repo_path = Path(temp_dir)

            # Create files
            (repo_path / "main.py").write_text('print("Hello World")')
            (repo_path / "utils.py").write_text('def helper(): pass')
            (repo_path / "config.json").write_text('{"key": "value"}')
            (repo_path / "README.md").write_text('# Test Project')

            # Create subdirectory
            subdir = repo_path / "src"
            subdir.mkdir()
            (subdir / "module.py").write_text('class Module: pass')

            # Parse repository
            documents = code_parser.parse_repository(str(repo_path), "test_repo")

            # Should parse all supported files
            assert len(documents) > 0

            # Should have documents from different file types
            file_types = set(doc.doc_type for doc in documents)
            assert "python_file" in file_types
            assert "generic_file" in file_types

    def test_file_size_limit(self, code_parser):
        """Test file size limit enforcement."""
        # Create a large file
        large_content = 'x' * (code_parser.max_file_size + 1000)

        with tempfile.NamedTemporaryFile(mode='w', suffix='.py', delete=False) as f:
            f.write(large_content)
            f.flush()

            try:
                documents = code_parser.parse_file(Path(f.name), Path(f.name).parent, "test_repo")

                # Should return empty list for files that are too large
                assert len(documents) == 0

            finally:
                os.unlink(f.name)

    def test_invalid_file_path(self, code_parser):
        """Test handling of invalid file paths."""
        # Test with non-existent file
        result = code_parser.parse_file(Path("/non/existent/file.py"), Path("/non/existent"), "test_repo")
        assert len(result) == 0

    def test_unicode_handling(self, code_parser):
        """Test Unicode character handling in files."""
        # Create a file with Unicode content
        unicode_content = '''
# File with Unicode characters
def greet():
    """Greeting function with Unicode: äöü ß éè"""
    message = "Hello, 世界! 🌍"
    return message
'''

        with tempfile.NamedTemporaryFile(mode='w', suffix='.py', delete=False, encoding='utf-8') as f:
            f.write(unicode_content)
            f.flush()

            try:
                documents = code_parser.parse_file(Path(f.name), Path(f.name).parent, "test_repo")

                # Should handle Unicode without errors
                assert len(documents) > 0

            finally:
                os.unlink(f.name)


if __name__ == '__main__':
    pytest.main([__file__])