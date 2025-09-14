"""
Settings configuration module for the RAG system.

This module provides centralized configuration management for all components.
"""

import os
import yaml
from typing import Dict, Any, Optional
from pathlib import Path

# Default configuration
DEFAULT_CONFIG = {
    "vector_store": {
        "provider": "chroma",
        "collection_name": "code_documents",
        "embedding_model": "all-MiniLM-L6-v2",
        "chunk_size": 512,
        "chunk_overlap": 50,
        "persist_directory": "./chroma_db"
    },
    "code_parser": {
        "supported_extensions": [
            ".py", ".js", ".ts", ".jsx", ".tsx", ".java", ".cpp", ".c", ".h", ".cs",
            ".rb", ".go", ".rs", ".php", ".swift", ".kt", ".scala", ".r", ".m", ".mm",
            ".pl", ".sh", ".bat", ".ps1", ".sql", ".html", ".css", ".scss", ".sass", ".less",
            ".xml", ".json", ".yaml", ".yml", ".toml", ".ini", ".cfg", ".conf", ".properties",
            ".md", ".rst", ".txt", ".tex", ".dockerfile", ".gitignore", ".env"
        ],
        "max_file_size": 1048576,  # 1MB
        "exclude_patterns": [
            "__pycache__", "*.pyc", "*.pyo", "*.pyd", ".git", ".svn", ".hg",
            "node_modules", "vendor", "dist", "build", "*.egg-info", ".pytest_cache",
            ".mypy_cache", ".tox", ".coverage", "htmlcov", ".idea", ".vscode",
            "*.swp", "*.swo", "*~", ".DS_Store", "Thumbs.db"
        ],
        "documentation_extensions": [".md", ".rst", ".txt", ".pdf", ".docx"],
        "test_file_patterns": [
            "test_*.py", "*_test.py", "*_tests.py", "tests.py", "Test*.java",
            "*Test.java", "*Tests.java", "test_*.js", "*_test.js", "*_spec.js", "spec_*.js"
        ]
    },
    "external_repositories": [],
    "llm_provider": {
        "provider": "openai",
        "model": "gpt-3.5-turbo",
        "max_tokens": 500,
        "temperature": 0.1
    },
    "rag_settings": {
        "top_k": 5,
        "max_context_tokens": 2000,
        "min_confidence": 0.1
    }
}

# Global configuration cache
_config_cache = None


def load_config(config_path: Optional[str] = None) -> Dict[str, Any]:
    """
    Load configuration from file or return default configuration.

    Args:
        config_path: Path to configuration file (YAML format)

    Returns:
        Configuration dictionary
    """
    global _config_cache

    if _config_cache is not None:
        return _config_cache

    config = DEFAULT_CONFIG.copy()

    if config_path and os.path.exists(config_path):
        try:
            with open(config_path, 'r', encoding='utf-8') as f:
                file_config = yaml.safe_load(f)
                if file_config:
                    # Merge file config with defaults
                    _merge_configs(config, file_config)
        except Exception as e:
            print(f"Warning: Could not load config file {config_path}: {e}")
            print("Using default configuration.")

    _config_cache = config
    return config


def _merge_configs(base_config: Dict[str, Any], override_config: Dict[str, Any]) -> None:
    """
    Recursively merge configuration dictionaries.

    Args:
        base_config: Base configuration to merge into
        override_config: Configuration with overrides
    """
    for key, value in override_config.items():
        if key in base_config and isinstance(base_config[key], dict) and isinstance(value, dict):
            _merge_configs(base_config[key], value)
        else:
            base_config[key] = value


def get_settings(key: Optional[str] = None, default: Any = None) -> Any:
    """
    Get configuration settings.

    Args:
        key: Configuration key (supports dot notation, e.g., 'vector_store.provider')
        default: Default value if key not found

    Returns:
        Configuration value or default
    """
    config = load_config()

    if key is None:
        return config

    # Handle dot notation
    keys = key.split('.')
    value = config

    try:
        for k in keys:
            value = value[k]
        return value
    except (KeyError, TypeError):
        return default


def set_settings(key: str, value: Any) -> None:
    """
    Set a configuration value.

    Args:
        key: Configuration key (supports dot notation)
        value: Value to set
    """
    global _config_cache

    if _config_cache is None:
        load_config()

    keys = key.split('.')
    config = _config_cache

    # Navigate to the parent of the target key
    for k in keys[:-1]:
        if k not in config:
            config[k] = {}
        config = config[k]

    # Set the value
    config[keys[-1]] = value


def reset_config() -> None:
    """Reset configuration cache."""
    global _config_cache
    _config_cache = None


def get_openai_api_key() -> Optional[str]:
    """
    Get OpenAI API key from environment or configuration.

    Returns:
        OpenAI API key or None if not configured
    """
    # First check environment variable
    api_key = os.environ.get('OPENAI_API_KEY')
    if api_key:
        return api_key

    # Then check configuration
    return get_settings('openai_api_key')


def validate_config() -> bool:
    """
    Validate the current configuration.

    Returns:
        True if configuration is valid, False otherwise
    """
    config = load_config()

    required_sections = ['vector_store', 'code_parser']
    for section in required_sections:
        if section not in config:
            print(f"Error: Missing required configuration section: {section}")
            return False

    # Validate vector store configuration
    vs_config = config['vector_store']
    if 'provider' not in vs_config:
        print("Error: vector_store.provider is required")
        return False

    # Validate code parser configuration
    cp_config = config['code_parser']
    if 'supported_extensions' not in cp_config:
        print("Error: code_parser.supported_extensions is required")
        return False

    return True


def save_config(config_path: str, config: Optional[Dict[str, Any]] = None) -> bool:
    """
    Save configuration to file.

    Args:
        config_path: Path to save configuration file
        config: Configuration to save (uses current config if None)

    Returns:
        True if successful, False otherwise
    """
    if config is None:
        config = load_config()

    try:
        # Create directory if it doesn't exist
        os.makedirs(os.path.dirname(config_path), exist_ok=True)

        with open(config_path, 'w', encoding='utf-8') as f:
            yaml.dump(config, f, default_flow_style=False, indent=2)

        return True
    except Exception as e:
        print(f"Error saving configuration to {config_path}: {e}")
        return False


def get_config_summary() -> Dict[str, Any]:
    """
    Get a summary of the current configuration.

    Returns:
        Configuration summary
    """
    config = load_config()

    summary = {
        'vector_store': {
            'provider': config['vector_store'].get('provider'),
            'collection_name': config['vector_store'].get('collection_name'),
            'embedding_model': config['vector_store'].get('embedding_model')
        },
        'code_parser': {
            'supported_extensions_count': len(config['code_parser'].get('supported_extensions', [])),
            'max_file_size': config['code_parser'].get('max_file_size'),
            'exclude_patterns_count': len(config['code_parser'].get('exclude_patterns', []))
        },
        'llm_provider': {
            'provider': config['llm_provider'].get('provider'),
            'model': config['llm_provider'].get('model')
        },
        'external_repositories_count': len(config.get('external_repositories', [])),
        'openai_configured': bool(get_openai_api_key())
    }

    return summary


# Initialize configuration on module load
if not validate_config():
    print("Warning: Configuration validation failed. Using defaults.")


if __name__ == "__main__":
    # Print configuration summary for debugging
    print("Current Configuration Summary:")
    summary = get_config_summary()
    for section, values in summary.items():
        print(f"  {section}:")
        if isinstance(values, dict):
            for key, value in values.items():
                print(f"    {key}: {value}")
        else:
            print(f"    {values}")
    print()