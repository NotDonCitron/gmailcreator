"""
Code Parser for RAG Engine

This module provides functionality to parse code repositories and extract
meaningful information for indexing in the RAG system.
"""

import os
import re
import ast
import json
import logging
from typing import List, Dict, Any, Optional, Set
from dataclasses import dataclass, field
from pathlib import Path
import hashlib
from datetime import datetime

logger = logging.getLogger(__name__)


@dataclass
class Document:
    """Represents a document (code file or extracted component) for indexing."""
    id: str
    content: str
    metadata: Dict[str, Any]
    doc_type: str = "code"


@dataclass
class FunctionInfo:
    """Information about a function or method."""
    name: str
    signature: str
    docstring: str
    body: str
    start_line: int
    end_line: int
    parameters: List[str]
    return_type: Optional[str] = None
    decorators: List[str] = field(default_factory=list)


@dataclass
class ClassInfo:
    """Information about a class."""
    name: str
    docstring: str
    methods: List[FunctionInfo]
    start_line: int
    end_line: int
    base_classes: List[str] = field(default_factory=list)
    decorators: List[str] = field(default_factory=list)


@dataclass
class ModuleInfo:
    """Information about a Python module."""
    file_path: str
    docstring: str
    functions: List[FunctionInfo]
    classes: List[ClassInfo]
    imports: List[str]
    global_variables: List[str]
    constants: List[str]


class CodeParser:
    """Parser for code repositories."""
    
    def __init__(self, config: Optional[Dict[str, Any]] = None):
        self.config = config or {}
        self.supported_extensions = self.config.get(
            "supported_extensions",
            [".py", ".js", ".ts", ".jsx", ".tsx", ".java", ".cpp", ".c", ".h", ".cs", ".rb", ".go", ".rs"]
        )
        self.ignore_patterns = self.config.get(
            "ignore_patterns",
            [
                "__pycache__", ".git", ".svn", ".hg", "node_modules", "venv", "env",
                ".venv", ".env", "dist", "build", "target", "*.egg-info", ".pytest_cache",
                ".mypy_cache", ".coverage", "htmlcov", ".tox", ".nox", ".hypothesis"
            ]
        )
        self.max_file_size = self.config.get("max_file_size", 1024 * 1024)  # 1MB
        self.include_docstrings = self.config.get("include_docstrings", True)
        self.include_comments = self.config.get("include_comments", True)
        
        logger.info(f"CodeParser initialized with {len(self.supported_extensions)} supported extensions")
    
    def parse_repository(self, repo_path: str, repo_name: str = "") -> List[Document]:
        """Parse an entire repository and return documents for indexing."""
        try:
            logger.info(f"Parsing repository: {repo_path}")
            
            repo_path = Path(repo_path)
            if not repo_path.exists():
                logger.error(f"Repository path does not exist: {repo_path}")
                return []
            
            documents = []
            
            # Walk through the repository
            for root, dirs, files in os.walk(repo_path):
                # Filter out ignored directories
                dirs[:] = [d for d in dirs if not self._should_ignore(d)]
                
                for file in files:
                    file_path = Path(root) / file
                    
                    # Check if file should be processed
                    if not self._should_process_file(file_path):
                        continue
                    
                    # Parse the file
                    try:
                        file_docs = self.parse_file(file_path, repo_path, repo_name)
                        documents.extend(file_docs)
                    except Exception as e:
                        logger.warning(f"Failed to parse file {file_path}: {e}")
            
            logger.info(f"Parsed {len(documents)} documents from repository")
            return documents
        
        except Exception as e:
            logger.error(f"Repository parsing failed: {e}")
            return []
    
    def parse_file(self, file_path: Path, repo_path: Path, repo_name: str = "") -> List[Document]:
        """Parse a single file and return documents."""
        try:
            # Check file size
            if file_path.stat().st_size > self.max_file_size:
                logger.warning(f"File too large, skipping: {file_path}")
                return []
            
            # Read file content
            try:
                with open(file_path, 'r', encoding='utf-8') as f:
                    content = f.read()
            except UnicodeDecodeError:
                logger.warning(f"Could not decode file: {file_path}")
                return []
            
            # Get relative path
            relative_path = file_path.relative_to(repo_path)
            
            # Create base metadata
            metadata = {
                "file_path": str(relative_path),
                "repo_path": str(repo_path),
                "repo_name": repo_name,
                "file_size": len(content),
                "last_modified": datetime.fromtimestamp(file_path.stat().st_mtime).isoformat(),
                "extension": file_path.suffix
            }
            
            documents = []
            
            # Parse based on file type
            if file_path.suffix == ".py":
                documents = self._parse_python_file(content, metadata)
            elif file_path.suffix in [".js", ".jsx", ".ts", ".tsx"]:
                documents = self._parse_javascript_file(content, metadata)
            elif file_path.suffix in [".java"]:
                documents = self._parse_java_file(content, metadata)
            else:
                # Generic file parsing
                documents = self._parse_generic_file(content, metadata)
            
            return documents
        
        except Exception as e:
            logger.error(f"File parsing failed for {file_path}: {e}")
            return []
    
    def _parse_python_file(self, content: str, metadata: Dict[str, Any]) -> List[Document]:
        """Parse a Python file and extract structured information."""
        documents = []
        
        try:
            # Parse the AST
            tree = ast.parse(content)
            
            # Extract module-level information
            module_info = self._extract_python_module_info(tree, content)
            
            # Create document for the entire file
            file_doc = Document(
                id=self._generate_id(f"{metadata['file_path']}_file"),
                content=content,
                metadata={
                    **metadata,
                    "doc_type": "python_file",
                    "functions_count": len(module_info.functions),
                    "classes_count": len(module_info.classes),
                    "imports_count": len(module_info.imports)
                },
                doc_type="python_file"
            )
            documents.append(file_doc)
            
            # Create documents for individual functions
            for func in module_info.functions:
                func_content = self._format_function_info(func)
                func_doc = Document(
                    id=self._generate_id(f"{metadata['file_path']}_func_{func.name}"),
                    content=func_content,
                    metadata={
                        **metadata,
                        "doc_type": "python_function",
                        "function_name": func.name,
                        "function_signature": func.signature,
                        "start_line": func.start_line,
                        "end_line": func.end_line,
                        "parameters": func.parameters,
                        "return_type": func.return_type,
                        "decorators": func.decorators
                    },
                    doc_type="python_function"
                )
                documents.append(func_doc)
            
            # Create documents for individual classes
            for cls in module_info.classes:
                cls_content = self._format_class_info(cls)
                cls_doc = Document(
                    id=self._generate_id(f"{metadata['file_path']}_class_{cls.name}"),
                    content=cls_content,
                    metadata={
                        **metadata,
                        "doc_type": "python_class",
                        "class_name": cls.name,
                        "methods_count": len(cls.methods),
                        "base_classes": cls.base_classes,
                        "decorators": cls.decorators,
                        "start_line": cls.start_line,
                        "end_line": cls.end_line
                    },
                    doc_type="python_class"
                )
                documents.append(cls_doc)
            
            # Create documents for individual methods
            for cls in module_info.classes:
                for method in cls.methods:
                    method_content = self._format_function_info(method)
                    method_doc = Document(
                        id=self._generate_id(f"{metadata['file_path']}_method_{cls.name}_{method.name}"),
                        content=method_content,
                        metadata={
                            **metadata,
                            "doc_type": "python_method",
                            "class_name": cls.name,
                            "method_name": method.name,
                            "method_signature": method.signature,
                            "start_line": method.start_line,
                            "end_line": method.end_line,
                            "parameters": method.parameters,
                            "return_type": method.return_type,
                            "decorators": method.decorators
                        },
                        doc_type="python_method"
                    )
                    documents.append(method_doc)
            
            return documents
        
        except SyntaxError as e:
            logger.warning(f"Syntax error in Python file {metadata['file_path']}: {e}")
            # Fallback to generic parsing
            return self._parse_generic_file(content, metadata)
    
    def _parse_javascript_file(self, content: str, metadata: Dict[str, Any]) -> List[Document]:
        """Parse a JavaScript/TypeScript file."""
        # For now, use generic parsing for JS/TS files
        # TODO: Implement proper JS/TS parsing with AST
        return self._parse_generic_file(content, metadata)
    
    def _parse_java_file(self, content: str, metadata: Dict[str, Any]) -> List[Document]:
        """Parse a Java file."""
        # For now, use generic parsing for Java files
        # TODO: Implement proper Java parsing
        return self._parse_generic_file(content, metadata)
    
    def _parse_generic_file(self, content: str, metadata: Dict[str, Any]) -> List[Document]:
        """Parse a generic file (fallback method)."""
        # Extract basic information
        lines = content.split('\n')
        
        # Count different types of lines
        code_lines = 0
        comment_lines = 0
        empty_lines = 0
        
        for line in lines:
            line = line.strip()
            if not line:
                empty_lines += 1
            elif line.startswith('#') or line.startswith('//') or line.startswith('/*'):
                comment_lines += 1
            else:
                code_lines += 1
        
        # Create document
        doc = Document(
            id=self._generate_id(f"{metadata['file_path']}_file"),
            content=content,
            metadata={
                **metadata,
                "doc_type": "generic_file",
                "total_lines": len(lines),
                "code_lines": code_lines,
                "comment_lines": comment_lines,
                "empty_lines": empty_lines
            },
            doc_type="generic_file"
        )
        
        return [doc]
    
    def _extract_python_module_info(self, tree: ast.AST, content: str) -> ModuleInfo:
        """Extract information from a Python AST."""
        lines = content.split('\n')

        # Build parent map
        parent_map = {}
        for node in ast.walk(tree):
            for child in ast.iter_child_nodes(node):
                parent_map[child] = node

        # Get module docstring
        module_docstring = ast.get_docstring(tree) or ""

        # Extract imports
        imports = []
        for node in ast.walk(tree):
            if isinstance(node, ast.Import):
                for alias in node.names:
                    imports.append(alias.name)
            elif isinstance(node, ast.ImportFrom):
                if node.module:
                    for alias in node.names:
                        imports.append(f"{node.module}.{alias.name}")

        # Extract functions
        functions = []
        for node in ast.walk(tree):
            if isinstance(node, ast.FunctionDef) and not isinstance(node, ast.AsyncFunctionDef):
                parent = parent_map.get(node)
                if parent is None or not isinstance(parent, ast.ClassDef):
                    functions.append(self._extract_function_info(node, lines))

        # Extract classes
        classes = []
        for node in ast.walk(tree):
            if isinstance(node, ast.ClassDef):
                classes.append(self._extract_class_info(node, lines))
        
        # Extract global variables and constants
        global_variables = []
        constants = []
        for node in ast.walk(tree):
            if isinstance(node, ast.Assign):
                for target in node.targets:
                    if isinstance(target, ast.Name):
                        if target.id.isupper():
                            constants.append(target.id)
                        else:
                            global_variables.append(target.id)
        
        return ModuleInfo(
            file_path="",
            docstring=module_docstring,
            functions=functions,
            classes=classes,
            imports=imports,
            global_variables=global_variables,
            constants=constants
        )
    
    def _extract_function_info(self, node: ast.FunctionDef, lines: List[str]) -> FunctionInfo:
        """Extract information from a function AST node."""
        # Get function signature
        signature = self._get_function_signature(node, lines)
        
        # Get docstring
        docstring = ast.get_docstring(node) or ""
        
        # Get body
        body_start = node.body[0].lineno - 1 if node.body else node.lineno - 1
        body_end = node.end_lineno or node.lineno
        body = '\n'.join(lines[body_start:body_end])
        
        # Get parameters
        parameters = [arg.arg for arg in node.args.args]
        
        # Get return type annotation
        return_type = None
        if node.returns:
            return_type = ast.unparse(node.returns) if hasattr(ast, 'unparse') else str(node.returns)
        
        # Get decorators
        decorators = []
        for decorator in node.decorator_list:
            if hasattr(ast, 'unparse'):
                decorators.append(ast.unparse(decorator))
            else:
                decorators.append(str(decorator))
        
        return FunctionInfo(
            name=node.name,
            signature=signature,
            docstring=docstring,
            body=body,
            start_line=node.lineno,
            end_line=node.end_lineno or node.lineno,
            parameters=parameters,
            return_type=return_type,
            decorators=decorators
        )
    
    def _extract_class_info(self, node: ast.ClassDef, lines: List[str]) -> ClassInfo:
        """Extract information from a class AST node."""
        # Get docstring
        docstring = ast.get_docstring(node) or ""
        
        # Get methods
        methods = []
        for item in node.body:
            if isinstance(item, ast.FunctionDef) and not isinstance(item, ast.AsyncFunctionDef):
                methods.append(self._extract_function_info(item, lines))
        
        # Get base classes
        base_classes = []
        for base in node.bases:
            if hasattr(ast, 'unparse'):
                base_classes.append(ast.unparse(base))
            else:
                base_classes.append(str(base))
        
        # Get decorators
        decorators = []
        for decorator in node.decorator_list:
            if hasattr(ast, 'unparse'):
                decorators.append(ast.unparse(decorator))
            else:
                decorators.append(str(decorator))
        
        return ClassInfo(
            name=node.name,
            docstring=docstring,
            methods=methods,
            start_line=node.lineno,
            end_line=node.end_lineno or node.lineno,
            base_classes=base_classes,
            decorators=decorators
        )
    
    def _get_function_signature(self, node: ast.FunctionDef, lines: List[str]) -> str:
        """Get the function signature from the source lines."""
        try:
            # Try to get the exact signature from the source
            start_line = node.lineno - 1
            end_line = node.body[0].lineno - 1 if node.body else node.lineno
            
            signature_lines = []
            for i in range(start_line, end_line):
                if i < len(lines):
                    line = lines[i].strip()
                    signature_lines.append(line)
                    if line.endswith(':'):
                        break
            
            return ' '.join(signature_lines)
        except Exception:
            # Fallback to constructed signature
            params = [arg.arg for arg in node.args.args]
            return f"def {node.name}({', '.join(params)})"
    
    def _format_function_info(self, func: FunctionInfo) -> str:
        """Format function information for indexing."""
        parts = []
        
        # Add signature
        parts.append(f"Function: {func.signature}")
        
        # Add docstring if available
        if func.docstring:
            parts.append(f"Description: {func.docstring}")
        
        # Add parameters
        if func.parameters:
            parts.append(f"Parameters: {', '.join(func.parameters)}")
        
        # Add return type
        if func.return_type:
            parts.append(f"Returns: {func.return_type}")
        
        # Add decorators
        if func.decorators:
            parts.append(f"Decorators: {', '.join(func.decorators)}")
        
        # Add body (truncated if too long)
        body_lines = func.body.split('\n')
        if len(body_lines) > 20:
            body = '\n'.join(body_lines[:20]) + "\n... (truncated)"
        else:
            body = func.body
        
        parts.append(f"Implementation:\n{body}")
        
        return '\n\n'.join(parts)
    
    def _format_class_info(self, cls: ClassInfo) -> str:
        """Format class information for indexing."""
        parts = []
        
        # Add class name and base classes
        if cls.base_classes:
            parts.append(f"Class: {cls.name}({', '.join(cls.base_classes)})")
        else:
            parts.append(f"Class: {cls.name}")
        
        # Add docstring if available
        if cls.docstring:
            parts.append(f"Description: {cls.docstring}")
        
        # Add decorators
        if cls.decorators:
            parts.append(f"Decorators: {', '.join(cls.decorators)}")
        
        # Add methods summary
        if cls.methods:
            parts.append(f"Methods ({len(cls.methods)}):")
            for method in cls.methods:
                parts.append(f"  - {method.signature}")
        
        return '\n\n'.join(parts)
    
    def _should_process_file(self, file_path: Path) -> bool:
        """Check if a file should be processed."""
        # Check extension
        if file_path.suffix not in self.supported_extensions:
            return False
        
        # Check if file is in ignored directory
        for part in file_path.parts:
            if self._should_ignore(part):
                return False
        
        return True
    
    def _should_ignore(self, name: str) -> bool:
        """Check if a name should be ignored based on patterns."""
        for pattern in self.ignore_patterns:
            if '*' in pattern:
                # Handle glob patterns
                import fnmatch
                if fnmatch.fnmatch(name, pattern):
                    return True
            elif name == pattern or name.startswith(pattern):
                return True
        
        return False
    
    def _generate_id(self, content: str) -> str:
        """Generate a unique ID for a document."""
        return hashlib.md5(content.encode()).hexdigest()


def main():
    """Main function for testing the code parser."""
    # Configure logging
    logging.basicConfig(
        level=logging.INFO,
        format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
    )
    
    # Create parser
    parser = CodeParser()
    
    # Test parsing a directory
    test_dir = "."
    documents = parser.parse_repository(test_dir, "test_repo")
    
    print(f"Parsed {len(documents)} documents")
    
    # Print some statistics
    doc_types = {}
    for doc in documents:
        doc_type = doc.metadata.get("doc_type", "unknown")
        doc_types[doc_type] = doc_types.get(doc_type, 0) + 1
    
    print("Document types:")
    for doc_type, count in doc_types.items():
        print(f"  {doc_type}: {count}")


if __name__ == "__main__":
    main()