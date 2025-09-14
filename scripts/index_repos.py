#!/usr/bin/env python3
"""
Repository indexing script for the RAG Code Assistant system.

This script handles the indexing of code repositories, including external repositories
from GitHub, local repositories, and individual files.
"""

import os
import sys
import json
import yaml
import logging
import argparse
import subprocess
import shutil
from pathlib import Path
from typing import Dict, List, Optional, Any
from datetime import datetime
import time

# Add parent directory to path for imports
sys.path.append(str(Path(__file__).parent.parent))

from rag_engine import RAGEngine
from code_parser import CodeParser

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

class RepositoryIndexer:
    """Handles indexing of code repositories for the RAG system."""
    
    def __init__(self, config_path: str = "rag_config.yaml"):
        """Initialize the repository indexer."""
        self.config_path = config_path
        self.config = self.load_config()
        self.project_root = Path(__file__).parent.parent
        
        # Setup directories
        self.data_dir = self.project_root / "data"
        self.external_repos_dir = self.project_root / "external_repos"
        self.logs_dir = self.project_root / "logs"
        self.processed_data_dir = self.data_dir / "processed"
        
        # Ensure directories exist
        self.external_repos_dir.mkdir(parents=True, exist_ok=True)
        self.processed_data_dir.mkdir(parents=True, exist_ok=True)
        
        # Initialize components
        self.rag_engine = RAGEngine(config_path)
        self.code_parser = CodeParser(config_path)
        
        # Statistics
        self.stats = {
            'total_repositories': 0,
            'successful_repositories': 0,
            'failed_repositories': 0,
            'total_files': 0,
            'successful_files': 0,
            'failed_files': 0,
            'total_chunks': 0,
            'processing_time': 0
        }
        
        # Processing history
        self.processing_history = []
    
    def load_config(self) -> Dict:
        """Load configuration from YAML file."""
        try:
            with open(self.config_path, 'r') as f:
                return yaml.safe_load(f)
        except FileNotFoundError:
            logger.error(f"Configuration file not found: {self.config_path}")
            sys.exit(1)
        except yaml.YAMLError as e:
            logger.error(f"Error parsing configuration file: {e}")
            sys.exit(1)
    
    def load_external_repos_config(self, config_path: str = "external_repos.json") -> Dict:
        """Load external repositories configuration."""
        try:
            full_path = self.project_root / config_path
            if not full_path.exists():
                logger.warning(f"External repositories config not found: {config_path}")
                return {'repositories': []}
            
            with open(full_path, 'r') as f:
                return json.load(f)
                
        except json.JSONDecodeError as e:
            logger.error(f"Error parsing external repositories config: {e}")
            return {'repositories': []}
        except Exception as e:
            logger.error(f"Error loading external repositories config: {e}")
            return {'repositories': []}
    
    def clone_repository(self, repo_url: str, repo_name: str, branch: str = "main") -> Optional[Path]:
        """Clone a repository from GitHub."""
        try:
            repo_dir = self.external_repos_dir / repo_name
            
            # Check if repository already exists
            if repo_dir.exists():
                logger.info(f"Repository {repo_name} already exists, updating...")
                
                # Update existing repository
                try:
                    subprocess.run(
                        ["git", "pull", "origin", branch],
                        cwd=repo_dir,
                        check=True,
                        capture_output=True,
                        text=True
                    )
                    logger.info(f"Updated repository: {repo_name}")
                    return repo_dir
                    
                except subprocess.CalledProcessError as e:
                    logger.error(f"Failed to update repository {repo_name}: {e}")
                    return None
            
            # Clone new repository
            logger.info(f"Cloning repository: {repo_url}")
            
            clone_command = ["git", "clone", "-b", branch, repo_url, str(repo_dir)]
            
            result = subprocess.run(
                clone_command,
                check=True,
                capture_output=True,
                text=True
            )
            
            logger.info(f"Successfully cloned repository: {repo_name}")
            return repo_dir
            
        except subprocess.CalledProcessError as e:
            logger.error(f"Failed to clone repository {repo_url}: {e}")
            return None
        except Exception as e:
            logger.error(f"Error cloning repository {repo_url}: {e}")
            return None
    
    def should_include_file(self, file_path: Path, include_patterns: List[str], 
                           exclude_patterns: List[str]) -> bool:
        """Check if a file should be included based on patterns."""
        try:
            file_name = file_path.name
            
            # Check exclude patterns first
            for pattern in exclude_patterns:
                if file_path.match(pattern) or file_name.startswith(pattern.lstrip('*')):
                    return False
            
            # Check include patterns
            if not include_patterns:
                return True
            
            for pattern in include_patterns:
                if file_path.match(pattern) or file_name.endswith(pattern.lstrip('*')):
                    return True
            
            return False
            
        except Exception as e:
            logger.error(f"Error checking file patterns for {file_path}: {e}")
            return False
    
    def process_file(self, file_path: Path, repo_name: str) -> Dict:
        """Process a single file and add it to the vector database."""
        try:
            logger.debug(f"Processing file: {file_path}")
            
            # Parse the file
            parsed_data = self.code_parser.parse_file(file_path)
            
            if not parsed_data:
                logger.warning(f"Could not parse file: {file_path}")
                return {
                    'status': 'failed',
                    'error': 'Could not parse file',
                    'chunks_created': 0
                }
            
            # Add repository context
            parsed_data['repository'] = repo_name
            parsed_data['file_path'] = str(file_path)
            
            # Add to vector database
            chunks_created = self.rag_engine.add_document(parsed_data)
            
            logger.debug(f"Successfully processed file: {file_path} ({chunks_created} chunks)")
            
            return {
                'status': 'success',
                'chunks_created': chunks_created,
                'file_size': parsed_data.get('file_size', 0),
                'functions_count': len(parsed_data.get('functions', [])),
                'classes_count': len(parsed_data.get('classes', []))
            }
            
        except Exception as e:
            logger.error(f"Error processing file {file_path}: {e}")
            return {
                'status': 'failed',
                'error': str(e),
                'chunks_created': 0
            }
    
    def process_repository(self, repo_path: Path, repo_config: Dict) -> Dict:
        """Process a single repository."""
        try:
            repo_name = repo_config.get('name', repo_path.name)
            include_patterns = repo_config.get('include_patterns', ['*.py', '*.js', '*.ts', '*.java', '*.cpp'])
            exclude_patterns = repo_config.get('exclude_patterns', ['*.pyc', '__pycache__', 'node_modules', '*.min.js'])
            
            logger.info(f"Processing repository: {repo_name}")
            
            repo_stats = {
                'name': repo_name,
                'path': str(repo_path),
                'total_files': 0,
                'processed_files': 0,
                'failed_files': 0,
                'total_chunks': 0,
                'start_time': time.time(),
                'end_time': None,
                'status': 'processing'
            }
            
            # Find all files in the repository
            all_files = []
            for root, dirs, files in os.walk(repo_path):
                # Skip hidden directories and common ignore patterns
                dirs[:] = [d for d in dirs if not d.startswith('.') and d not in ['node_modules', '__pycache__', 'dist', 'build']]
                
                for file in files:
                    file_path = Path(root) / file
                    
                    # Check if file should be included
                    if self.should_include_file(file_path, include_patterns, exclude_patterns):
                        all_files.append(file_path)
            
            repo_stats['total_files'] = len(all_files)
            logger.info(f"Found {len(all_files)} files to process in {repo_name}")
            
            # Process each file
            for i, file_path in enumerate(all_files, 1):
                try:
                    logger.info(f"Processing file {i}/{len(all_files)}: {file_path.name}")
                    
                    file_result = self.process_file(file_path, repo_name)
                    
                    if file_result['status'] == 'success':
                        repo_stats['processed_files'] += 1
                        repo_stats['total_chunks'] += file_result['chunks_created']
                    else:
                        repo_stats['failed_files'] += 1
                        logger.warning(f"Failed to process file: {file_path.name} - {file_result.get('error', 'Unknown error')}")
                    
                except Exception as e:
                    logger.error(f"Error processing file {file_path}: {e}")
                    repo_stats['failed_files'] += 1
            
            repo_stats['end_time'] = time.time()
            repo_stats['processing_time'] = repo_stats['end_time'] - repo_stats['start_time']
            
            # Determine overall status
            if repo_stats['failed_files'] == 0:
                repo_stats['status'] = 'success'
            elif repo_stats['processed_files'] > 0:
                repo_stats['status'] = 'partial_success'
            else:
                repo_stats['status'] = 'failed'
            
            logger.info(f"Repository {repo_name} processing completed:")
            logger.info(f"  Total files: {repo_stats['total_files']}")
            logger.info(f"  Processed: {repo_stats['processed_files']}")
            logger.info(f"  Failed: {repo_stats['failed_files']}")
            logger.info(f"  Chunks created: {repo_stats['total_chunks']}")
            logger.info(f"  Processing time: {repo_stats['processing_time']:.2f}s")
            
            return repo_stats
            
        except Exception as e:
            logger.error(f"Error processing repository {repo_name}: {e}")
            repo_stats['status'] = 'failed'
            repo_stats['error'] = str(e)
            repo_stats['end_time'] = time.time()
            repo_stats['processing_time'] = repo_stats['end_time'] - repo_stats['start_time']
            return repo_stats
    
    def index_external_repositories(self, repos_config: Dict) -> Dict:
        """Index external repositories from GitHub."""
        try:
            repositories = repos_config.get('repositories', [])
            
            if not repositories:
                logger.warning("No external repositories configured")
                return {'status': 'completed', 'repositories': []}
            
            logger.info(f"Processing {len(repositories)} external repositories")
            
            results = {
                'status': 'completed',
                'repositories': [],
                'total_repos': len(repositories),
                'successful_repos': 0,
                'failed_repos': 0
            }
            
            for repo_config in repositories:
                try:
                    repo_url = repo_config.get('url')
                    repo_name = repo_config.get('name')
                    branch = repo_config.get('branch', 'main')
                    
                    if not repo_url or not repo_name:
                        logger.warning(f"Invalid repository configuration: {repo_config}")
                        continue
                    
                    # Clone or update repository
                    repo_path = self.clone_repository(repo_url, repo_name, branch)
                    
                    if not repo_path:
                        results['failed_repos'] += 1
                        continue
                    
                    # Process repository
                    repo_result = self.process_repository(repo_path, repo_config)
                    results['repositories'].append(repo_result)
                    
                    if repo_result['status'] in ['success', 'partial_success']:
                        results['successful_repos'] += 1
                    else:
                        results['failed_repos'] += 1
                    
                    # Update statistics
                    self.stats['total_repositories'] += 1
                    if repo_result['status'] in ['success', 'partial_success']:
                        self.stats['successful_repositories'] += 1
                    else:
                        self.stats['failed_repositories'] += 1
                    
                    self.stats['total_files'] += repo_result['total_files']
                    self.stats['successful_files'] += repo_result['processed_files']
                    self.stats['failed_files'] += repo_result['failed_files']
                    self.stats['total_chunks'] += repo_result['total_chunks']
                    
                except Exception as e:
                    logger.error(f"Error processing external repository {repo_name}: {e}")
                    results['failed_repos'] += 1
            
            logger.info("External repository indexing completed")
            return results
            
        except Exception as e:
            logger.error(f"Error indexing external repositories: {e}")
            return {'status': 'failed', 'error': str(e)}
    
    def index_local_repository(self, repo_path: str, repo_name: Optional[str] = None) -> Dict:
        """Index a local repository."""
        try:
            repo_path = Path(repo_path)
            
            if not repo_path.exists():
                logger.error(f"Local repository path does not exist: {repo_path}")
                return {'status': 'failed', 'error': 'Repository path does not exist'}
            
            if not repo_path.is_dir():
                logger.error(f"Local repository path is not a directory: {repo_path}")
                return {'status': 'failed', 'error': 'Repository path is not a directory'}
            
            repo_name = repo_name or repo_path.name
            
            repo_config = {
                'name': repo_name,
                'include_patterns': ['*.py', '*.js', '*.ts', '*.java', '*.cpp'],
                'exclude_patterns': ['*.pyc', '__pycache__', 'node_modules', '*.min.js']
            }
            
            logger.info(f"Indexing local repository: {repo_name}")
            
            repo_result = self.process_repository(repo_path, repo_config)
            
            # Update statistics
            self.stats['total_repositories'] += 1
            if repo_result['status'] in ['success', 'partial_success']:
                self.stats['successful_repositories'] += 1
            else:
                self.stats['failed_repositories'] += 1
            
            self.stats['total_files'] += repo_result['total_files']
            self.stats['successful_files'] += repo_result['processed_files']
            self.stats['failed_files'] += repo_result['failed_files']
            self.stats['total_chunks'] += repo_result['total_chunks']
            
            logger.info("Local repository indexing completed")
            return {
                'status': 'completed',
                'result': repo_result,
                'stats': self.stats
            }
            
        except Exception as e:
            logger.error(f"Error indexing local repository: {e}")
            return {'status': 'failed', 'error': str(e)}
    
    def index_single_file(self, file_path: str) -> Dict:
        """Index a single file."""
        try:
            file_path = Path(file_path)
            
            if not file_path.exists():
                logger.error(f"File does not exist: {file_path}")
                return {'status': 'failed', 'error': 'File does not exist'}
            
            if not file_path.is_file():
                logger.error(f"Path is not a file: {file_path}")
                return {'status': 'failed', 'error': 'Path is not a file'}
            
            logger.info(f"Indexing single file: {file_path}")
            
            file_result = self.process_file(file_path, "single_file")
            
            if file_result['status'] == 'success':
                logger.info(f"Successfully indexed file: {file_path}")
                logger.info(f"  Chunks created: {file_result['chunks_created']}")
            else:
                logger.error(f"Failed to index file: {file_path}")
                logger.error(f"  Error: {file_result.get('error', 'Unknown error')}")
            
            return {
                'status': 'completed',
                'result': file_result
            }
            
        except Exception as e:
            logger.error(f"Error indexing single file: {e}")
            return {'status': 'failed', 'error': str(e)}
    
    def save_indexing_report(self, results: Dict) -> None:
        """Save indexing results to a report file."""
        try:
            timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
            report_file = self.processed_data_dir / f"indexing_report_{timestamp}.json"
            
            report_data = {
                'timestamp': datetime.now().isoformat(),
                'results': results,
                'stats': self.stats,
                'processing_history': self.processing_history
            }
            
            with open(report_file, 'w') as f:
                json.dump(report_data, f, indent=2)
            
            logger.info(f"Indexing report saved to: {report_file}")
            
        except Exception as e:
            logger.error(f"Error saving indexing report: {e}")
    
    def show_statistics(self) -> None:
        """Display indexing statistics."""
        try:
            stats_text = f"""
Indexing Statistics:
====================
Total Repositories: {self.stats['total_repositories']}
Successful Repositories: {self.stats['successful_repositories']}
Failed Repositories: {self.stats['failed_repositories']}

Total Files: {self.stats['total_files']}
Successfully Processed Files: {self.stats['successful_files']}
Failed Files: {self.stats['failed_files']}

Total Chunks Created: {self.stats['total_chunks']}
Total Processing Time: {self.stats['processing_time']:.2f} seconds

Success Rate (Repositories): {(self.stats['successful_repositories'] / max(1, self.stats['total_repositories']) * 100):.1f}%
Success Rate (Files): {(self.stats['successful_files'] / max(1, self.stats['total_files']) * 100):.1f}%
"""
            print(stats_text)
            
        except Exception as e:
            logger.error(f"Error displaying statistics: {e}")

def main():
    """Main function for command-line usage."""
    parser = argparse.ArgumentParser(description='Index code repositories for the RAG system')
    parser.add_argument('--config', default='rag_config.yaml', 
                       help='Path to configuration file')
    parser.add_argument('--external-repos', 
                       help='Path to external repositories configuration file')
    parser.add_argument('--local-repo', 
                       help='Path to local repository to index')
    parser.add_argument('--single-file', 
                       help='Path to single file to index')
    parser.add_argument('--repo-name', 
                       help='Name for the repository (for local repos)')
    parser.add_argument('--clear-existing', action='store_true', 
                       help='Clear existing vector database before indexing')
    parser.add_argument('--save-report', action='store_true', 
                       help='Save indexing report to file')
    parser.add_argument('--verbose', action='store_true', 
                       help='Enable verbose logging')
    
    args = parser.parse_args()
    
    if args.verbose:
        logging.getLogger().setLevel(logging.DEBUG)
    
    indexer = RepositoryIndexer(args.config)
    
    # Clear existing vector database if requested
    if args.clear_existing:
        logger.info("Clearing existing vector database...")
        indexer.rag_engine.clear_collection()
    
    results = {}
    
    # Index external repositories
    if args.external_repos or not any([args.local_repo, args.single_file]):
        logger.info("Indexing external repositories...")
        
        repos_config_path = args.external_repos or "external_repos.json"
        repos_config = indexer.load_external_repos_config(repos_config_path)
        
        results['external_repos'] = indexer.index_external_repositories(repos_config)
    
    # Index local repository
    if args.local_repo:
        logger.info(f"Indexing local repository: {args.local_repo}")
        results['local_repo'] = indexer.index_local_repository(args.local_repo, args.repo_name)
    
    # Index single file
    if args.single_file:
        logger.info(f"Indexing single file: {args.single_file}")
        results['single_file'] = indexer.index_single_file(args.single_file)
    
    # Display statistics
    indexer.show_statistics()
    
    # Save report if requested
    if args.save_report:
        indexer.save_indexing_report(results)
    
    logger.info("Indexing process completed")

if __name__ == '__main__':
    main()