#!/usr/bin/env python3
"""
Setup script for the RAG Code Assistant system.

This script handles the initial setup, dependency installation, and configuration
of the RAG system components.
"""

import os
import sys
import subprocess
import json
import yaml
import logging
from pathlib import Path
from typing import Dict, List, Optional

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

class RAGSystemSetup:
    """Handles setup and initialization of the RAG system."""
    
    def __init__(self):
        """Initialize the setup process."""
        self.project_root = Path(__file__).parent.parent
        self.setup_complete = False
        
        # Define required directories
        self.required_dirs = [
            "data",
            "data/processed",
            "data/queries",
            "data/vector_db",
            "external_repos",
            "logs",
            "dashboard",
            "tests",
            ".github/workflows"
        ]
        
        # Define required files
        self.required_files = [
            "requirements.txt",
            "rag_config.yaml",
            "external_repos.json",
            ".env.example"
        ]
        
        # Define Python dependencies
        self.python_dependencies = [
            "torch>=1.9.0",
            "transformers>=4.20.0",
            "sentence-transformers>=2.2.0",
            "chromadb>=0.4.0",
            "numpy>=1.21.0",
            "pandas>=1.3.0",
            "pyyaml>=6.0",
            "python-dotenv>=0.19.0",
            "flask>=2.0.0",
            "flask-cors>=3.0.0",
            "requests>=2.25.0",
            "tqdm>=4.62.0",
            "colorama>=0.4.4",
            "click>=8.0.0"
        ]
        
        # Define optional dependencies
        self.optional_dependencies = {
            'dev': [
                "pytest>=6.0.0",
                "pytest-cov>=2.12.0",
                "black>=21.0.0",
                "flake8>=3.9.0",
                "mypy>=0.910"
            ],
            'gpu': [
                "torch[cuda]>=1.9.0",
                "tensorflow-gpu>=2.6.0"
            ],
            'docs': [
                "sphinx>=4.0.0",
                "sphinx-rtd-theme>=0.5.0"
            ]
        }
    
    def check_python_version(self) -> bool:
        """Check if Python version is compatible."""
        try:
            version = sys.version_info
            if version.major < 3 or (version.major == 3 and version.minor < 8):
                logger.error("Python 3.8 or higher is required")
                return False
            
            logger.info(f"Python version check passed: {version.major}.{version.minor}.{version.micro}")
            return True
            
        except Exception as e:
            logger.error(f"Error checking Python version: {e}")
            return False
    
    def check_pip_availability(self) -> bool:
        """Check if pip is available."""
        try:
            result = subprocess.run(
                [sys.executable, "-m", "pip", "--version"],
                capture_output=True,
                text=True,
                check=True
            )
            logger.info("pip is available")
            return True
            
        except subprocess.CalledProcessError:
            logger.error("pip is not available")
            return False
        except Exception as e:
            logger.error(f"Error checking pip availability: {e}")
            return False
    
    def create_directories(self) -> bool:
        """Create required directory structure."""
        try:
            logger.info("Creating directory structure...")
            
            for dir_path in self.required_dirs:
                full_path = self.project_root / dir_path
                full_path.mkdir(parents=True, exist_ok=True)
                logger.info(f"Created directory: {dir_path}")
            
            logger.info("Directory structure created successfully")
            return True
            
        except Exception as e:
            logger.error(f"Error creating directories: {e}")
            return False
    
    def check_required_files(self) -> bool:
        """Check if all required files exist."""
        try:
            logger.info("Checking required files...")
            
            missing_files = []
            
            for file_path in self.required_files:
                full_path = self.project_root / file_path
                if not full_path.exists():
                    missing_files.append(file_path)
            
            if missing_files:
                logger.warning(f"Missing files: {missing_files}")
                return False
            
            logger.info("All required files are present")
            return True
            
        except Exception as e:
            logger.error(f"Error checking required files: {e}")
            return False
    
    def install_python_dependencies(self, include_optional: List[str] = None) -> bool:
        """Install Python dependencies."""
        try:
            logger.info("Installing Python dependencies...")
            
            # Install main dependencies
            for dependency in self.python_dependencies:
                try:
                    logger.info(f"Installing {dependency}...")
                    subprocess.run(
                        [sys.executable, "-m", "pip", "install", dependency],
                        check=True,
                        capture_output=True,
                        text=True
                    )
                    logger.info(f"Successfully installed {dependency}")
                    
                except subprocess.CalledProcessError as e:
                    logger.error(f"Failed to install {dependency}: {e}")
                    return False
            
            # Install optional dependencies
            if include_optional:
                for optional_group in include_optional:
                    if optional_group in self.optional_dependencies:
                        logger.info(f"Installing optional dependencies: {optional_group}")
                        
                        for dependency in self.optional_dependencies[optional_group]:
                            try:
                                logger.info(f"Installing {dependency}...")
                                subprocess.run(
                                    [sys.executable, "-m", "pip", "install", dependency],
                                    check=True,
                                    capture_output=True,
                                    text=True
                                )
                                logger.info(f"Successfully installed {dependency}")
                                
                            except subprocess.CalledProcessError as e:
                                logger.error(f"Failed to install {dependency}: {e}")
                                return False
            
            logger.info("Python dependencies installed successfully")
            return True
            
        except Exception as e:
            logger.error(f"Error installing Python dependencies: {e}")
            return False
    
    def setup_vector_database(self) -> bool:
        """Initialize the vector database."""
        try:
            logger.info("Setting up vector database...")
            
            # Import required modules
            sys.path.append(str(self.project_root))
            from rag_engine import RAGEngine
            
            # Initialize RAG engine (this will create the vector database)
            rag_engine = RAGEngine("rag_config.yaml")
            
            logger.info("Vector database setup completed")
            return True
            
        except Exception as e:
            logger.error(f"Error setting up vector database: {e}")
            return False
    
    def validate_configuration(self) -> bool:
        """Validate the system configuration."""
        try:
            logger.info("Validating configuration...")
            
            # Load configuration
            config_path = self.project_root / "rag_config.yaml"
            if not config_path.exists():
                logger.error("Configuration file not found")
                return False
            
            with open(config_path, 'r') as f:
                config = yaml.safe_load(f)
            
            # Check required configuration sections
            required_sections = ['embedding', 'vector_store', 'llm', 'code_parser']
            
            for section in required_sections:
                if section not in config:
                    logger.error(f"Missing configuration section: {section}")
                    return False
            
            # Validate embedding configuration
            embedding_config = config.get('embedding', {})
            if 'model_name' not in embedding_config:
                logger.error("Missing embedding model_name in configuration")
                return False
            
            # Validate vector store configuration
            vector_store_config = config.get('vector_store', {})
            if 'collection_name' not in vector_store_config:
                logger.error("Missing vector_store collection_name in configuration")
                return False
            
            logger.info("Configuration validation passed")
            return True
            
        except Exception as e:
            logger.error(f"Error validating configuration: {e}")
            return False
    
    def create_sample_files(self) -> bool:
        """Create sample configuration files if they don't exist."""
        try:
            logger.info("Creating sample files...")
            
            # Create .env.example if it doesn't exist
            env_example_path = self.project_root / ".env.example"
            if not env_example_path.exists():
                env_content = """# RAG Code Assistant Environment Variables

# API Keys (if using external services)
OPENAI_API_KEY=your_openai_api_key_here
HUGGINGFACE_API_KEY=your_huggingface_api_key_here

# Vector Database Configuration
CHROMA_PERSIST_DIRECTORY=./data/vector_db
CHROMA_COLLECTION_NAME=code_assistant

# Model Configuration
EMBEDDING_MODEL_NAME=sentence-transformers/all-MiniLM-L6-v2
LLM_MODEL_NAME=microsoft/DialoGPT-medium

# Logging Configuration
LOG_LEVEL=INFO
LOG_FILE=./logs/rag_system.log

# Server Configuration (for dashboard)
FLASK_HOST=127.0.0.1
FLASK_PORT=5000
FLASK_DEBUG=False
"""
                
                with open(env_example_path, 'w') as f:
                    f.write(env_content)
                
                logger.info("Created .env.example file")
            
            # Create sample external_repos.json if it doesn't exist
            repos_path = self.project_root / "external_repos.json"
            if not repos_path.exists():
                repos_content = {
                    "repositories": [
                        {
                            "name": "example-repo",
                            "url": "https://github.com/example/example-repo.git",
                            "branch": "main",
                            "description": "Example repository for testing",
                            "include_patterns": ["*.py", "*.js", "*.ts", "*.java", "*.cpp"],
                            "exclude_patterns": ["*.pyc", "__pycache__", "node_modules", "*.min.js"]
                        }
                    ]
                }
                
                with open(repos_path, 'w') as f:
                    json.dump(repos_content, f, indent=2)
                
                logger.info("Created sample external_repos.json file")
            
            logger.info("Sample files created successfully")
            return True
            
        except Exception as e:
            logger.error(f"Error creating sample files: {e}")
            return False
    
    def run_tests(self) -> bool:
        """Run basic system tests."""
        try:
            logger.info("Running system tests...")
            
            # Import test modules
            sys.path.append(str(self.project_root))
            
            # Test basic imports
            try:
                from rag_engine import RAGEngine
                from code_parser import CodeParser
                logger.info("✓ Core modules imported successfully")
            except ImportError as e:
                logger.error(f"✗ Failed to import core modules: {e}")
                return False
            
            # Test configuration loading
            try:
                import yaml
                config_path = self.project_root / "rag_config.yaml"
                with open(config_path, 'r') as f:
                    config = yaml.safe_load(f)
                logger.info("✓ Configuration loaded successfully")
            except Exception as e:
                logger.error(f"✗ Failed to load configuration: {e}")
                return False
            
            logger.info("Basic system tests passed")
            return True
            
        except Exception as e:
            logger.error(f"Error running tests: {e}")
            return False
    
    def generate_setup_report(self) -> Dict:
        """Generate a setup completion report."""
        try:
            report = {
                'timestamp': str(datetime.now()),
                'python_version': f"{sys.version_info.major}.{sys.version_info.minor}.{sys.version_info.micro}",
                'project_root': str(self.project_root),
                'directories_created': self.required_dirs,
                'files_present': [],
                'files_missing': [],
                'dependencies_installed': [],
                'setup_status': 'incomplete'
            }
            
            # Check files
            for file_path in self.required_files:
                full_path = self.project_root / file_path
                if full_path.exists():
                    report['files_present'].append(file_path)
                else:
                    report['files_missing'].append(file_path)
            
            # Check if setup is complete
            if (len(report['files_missing']) == 0 and 
                self.setup_complete):
                report['setup_status'] = 'complete'
            
            return report
            
        except Exception as e:
            logger.error(f"Error generating setup report: {e}")
            return {'error': str(e)}
    
    def run_setup(self, include_optional: List[str] = None, 
                  skip_tests: bool = False) -> bool:
        """Run the complete setup process."""
        try:
            logger.info("Starting RAG Code Assistant setup...")
            logger.info("="*60)
            
            # Step 1: Check Python version
            logger.info("Step 1: Checking Python version...")
            if not self.check_python_version():
                return False
            
            # Step 2: Check pip availability
            logger.info("Step 2: Checking pip availability...")
            if not self.check_pip_availability():
                return False
            
            # Step 3: Create directory structure
            logger.info("Step 3: Creating directory structure...")
            if not self.create_directories():
                return False
            
            # Step 4: Check required files
            logger.info("Step 4: Checking required files...")
            if not self.check_required_files():
                logger.warning("Some required files are missing. Creating sample files...")
                if not self.create_sample_files():
                    return False
            
            # Step 5: Install Python dependencies
            logger.info("Step 5: Installing Python dependencies...")
            if not self.install_python_dependencies(include_optional):
                return False
            
            # Step 6: Validate configuration
            logger.info("Step 6: Validating configuration...")
            if not self.validate_configuration():
                return False
            
            # Step 7: Setup vector database
            logger.info("Step 7: Setting up vector database...")
            if not self.setup_vector_database():
                return False
            
            # Step 8: Run tests (optional)
            if not skip_tests:
                logger.info("Step 8: Running system tests...")
                if not self.run_tests():
                    logger.warning("Some tests failed, but setup will continue")
            
            # Mark setup as complete
            self.setup_complete = True
            
            # Generate setup report
            report = self.generate_setup_report()
            
            logger.info("="*60)
            logger.info("Setup completed successfully!")
            logger.info("="*60)
            
            # Save setup report
            report_path = self.project_root / "logs" / "setup_report.json"
            with open(report_path, 'w') as f:
                json.dump(report, f, indent=2)
            
            logger.info(f"Setup report saved to: {report_path}")
            
            return True
            
        except Exception as e:
            logger.error(f"Error during setup: {e}")
            return False

def main():
    """Main function for command-line usage."""
    parser = argparse.ArgumentParser(description='Setup the RAG Code Assistant system')
    parser.add_argument('--include-optional', nargs='+', 
                       choices=['dev', 'gpu', 'docs'],
                       help='Include optional dependency groups')
    parser.add_argument('--skip-tests', action='store_true', 
                       help='Skip system tests')
    parser.add_argument('--verbose', action='store_true', 
                       help='Enable verbose logging')
    parser.add_argument('--report-only', action='store_true', 
                       help='Generate setup report only')
    
    args = parser.parse_args()
    
    if args.verbose:
        logging.getLogger().setLevel(logging.DEBUG)
    
    setup = RAGSystemSetup()
    
    if args.report_only:
        report = setup.generate_setup_report()
        print(json.dumps(report, indent=2))
        sys.exit(0)
    
    success = setup.run_setup(
        include_optional=args.include_optional,
        skip_tests=args.skip_tests
    )
    
    sys.exit(0 if success else 1)

if __name__ == '__main__':
    main()