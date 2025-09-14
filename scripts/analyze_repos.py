#!/usr/bin/env python3
"""
Repository analysis and indexing script for the RAG Code Assistant system.

This script analyzes local and external repositories, extracts code content,
and indexes it into the vector database for semantic search.
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
from typing import Dict, List, Optional, Set
from datetime import datetime
import time
import hashlib

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

class RepositoryAnalyzer:
    """Analyzes and indexes code repositories for the RAG system."""
    
    def __init__(self, config_path: str = "rag_config.yaml"):
        """Initialize the repository analyzer."""
        self.config_path = config_path
        self.config = self.load_config()
        self.project_root = Path(__file__).parent.parent
        
        # Setup directories
        self.data_dir = self.project_root / "data"
        self.processed_dir = self.data_dir / "processed"
        self.external_repos_dir = self.project_root / "external_repos"
        self.logs_dir = self.project_root / "logs"
        
        # Ensure directories exist
        self.processed_dir.mkdir(parents=True, exist_ok=True)
        self.external_repos_dir.mkdir(parents=True, exist_ok=True)
        self.logs_dir.mkdir(parents=True, exist_ok=True)
        
        # Initialize components
        self.rag_engine = RAGEngine(config_path)
        self.code_parser = CodeParser(config_path)
        
        # Statistics
        self.stats = {
            'total_files': 0,
            'processed_files': 0,
            'skipped_files': 0,
            'error_files': 0,
            'total_chunks': 0,
            'processing_time': 0
        }
    
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
    
    def load_external_repos_config(self) -> Dict:
        """Load external repositories configuration."""
        config_file = self.project_root / "external_repos.json"
        
        try:
            with open(config_file, 'r') as f:
                return json.load(f)
        except FileNotFoundError:
            logger.error(f"External repositories config not found: {config_file}")
            return {"repositories": []}
        except json.JSONDecodeError as e:
            logger.error(f"Error parsing external repositories config: {e}")
            return {"repositories": []}
    
    def clone_repository(self, repo_url: str, branch: str = "main", 
                        target_dir: Optional[Path] = None) -> Optional[Path]:
        """Clone a repository from URL."""
        try:
            if target_dir is None:
                # Generate target directory name from URL
                repo_name = repo_url.split('/')[-1].replace('.git', '')
                target_dir = self.external_repos_dir / repo_name
            
            # Remove existing directory if it exists
            if target_dir.exists():
                shutil.rmtree(target_dir)
            
            # Clone repository
            logger.info(f"Cloning repository: {repo_url}")
            cmd = ['git', 'clone', '--branch', branch, '--depth', '1', repo_url, str(target_dir)]
            
            result = subprocess.run(cmd, capture_output=True, text=True)
            
            if result.returncode != 0:
                logger.error(f"Failed to clone repository: {result.stderr}")
                return None
            
            logger.info(f"Successfully cloned repository to: {target_dir}")
            return target_dir
            
        except Exception as e:
            logger.error(f"Error cloning repository: {e}")
            return None
    
    def get_file_hash(self, file_path: Path) -> str:
        """Get MD5 hash of a file."""
        try:
            with open(file_path, 'rb') as f:
                return hashlib.md5(f.read()).hexdigest()
        except Exception:
            return ""
    
    def is_file_processed(self, file_path: Path, repo_name: str) -> bool:
        """Check if a file has already been processed."""
        try:
            file_hash = self.get_file_hash(file_path)
            processed_file = self.processed_dir / f"{repo_name}_{file_path.name}.json"
            
            if processed_file.exists():
                with open(processed_file, 'r') as f:
                    processed_data = json.load(f)
                    return processed_data.get('file_hash') == file_hash
            
            return False
            
        except Exception:
            return False
    
    def mark_file_processed(self, file_path: Path, repo_name: str, 
                           chunks_count: int, metadata: Dict) -> None:
        """Mark a file as processed."""
        try:
            file_hash = self.get_file_hash(file_path)
            processed_file = self.processed_dir / f"{repo_name}_{file_path.name}.json"
            
            processed_data = {
                'file_path': str(file_path),
                'file_hash': file_hash,
                'repo_name': repo_name,
                'processed_at': datetime.now().isoformat(),
                'chunks_count': chunks_count,
                'metadata': metadata
            }
            
            with open(processed_file, 'w') as f:
                json.dump(processed_data, f, indent=2)
                
        except Exception as e:
            logger.error(f"Error marking file as processed: {e}")
    
    def should_include_file(self, file_path: Path, include_patterns: List[str], 
                           exclude_patterns: List[str]) -> bool:
        """Check if a file should be included based on patterns."""
        try:
            file_name = file_path.name
            
            # Check exclude patterns first
            for pattern in exclude_patterns:
                if file_name.startswith(pattern) or file_name.endswith(pattern.replace('*', '')):
                    return False
            
            # Check include patterns
            if not include_patterns:
                return True
            
            for pattern in include_patterns:
                if file_name.endswith(pattern.replace('*', '')):
                    return True
            
            return False
            
        except Exception:
            return False
    
    def analyze_local_repository(self, repo_path: Path, repo_name: Optional[str] = None,
                                include_patterns: Optional[List[str]] = None,
                                exclude_patterns: Optional[List[str]] = None) -> bool:
        """Analyze a local repository."""
        try:
            if not repo_path.exists():
                logger.error(f"Repository path does not exist: {repo_path}")
                return False
            
            if repo_name is None:
                repo_name = repo_path.name
            
            logger.info(f"Analyzing local repository: {repo_path}")
            
            # Default patterns if not provided
            if include_patterns is None:
                include_patterns = ['*.py', '*.js', '*.ts', '*.java', '*.cpp', '*.c', '*.go', '*.rs']
            
            if exclude_patterns is None:
                exclude_patterns = ['test*', 'node_modules', '*.min.js', '*.min.css', '__pycache__']
            
            # Collect files to process
            files_to_process = []
            for file_path in repo_path.rglob('*'):
                if file_path.is_file() and self.should_include_file(file_path, include_patterns, exclude_patterns):
                    files_to_process.append(file_path)
            
            logger.info(f"Found {len(files_to_process)} files to process")
            
            # Process files
            success_count = 0
            for i, file_path in enumerate(files_to_process):
                logger.info(f"Processing file {i+1}/{len(files_to_process)}: {file_path}")
                
                try:
                    if self.process_file(file_path, repo_name):
                        success_count += 1
                except Exception as e:
                    logger.error(f"Error processing file {file_path}: {e}")
                    self.stats['error_files'] += 1
            
            logger.info(f"Successfully processed {success_count}/{len(files_to_process)} files")
            return success_count > 0
            
        except Exception as e:
            logger.error(f"Error analyzing local repository: {e}")
            return False
    
    def process_file(self, file_path: Path, repo_name: str) -> bool:
        """Process a single file."""
        try:
            self.stats['total_files'] += 1
            
            # Check if file has already been processed
            if self.is_file_processed(file_path, repo_name):
                logger.info(f"File already processed, skipping: {file_path}")
                self.stats['skipped_files'] += 1
                return True
            
            # Parse the file
            logger.debug(f"Parsing file: {file_path}")
            parsed_data = self.code_parser.parse_file(file_path)
            
            if not parsed_data:
                logger.warning(f"Failed to parse file: {file_path}")
                self.stats['skipped_files'] += 1
                return False
            
            # Create chunks
            chunks = self.code_parser.create_chunks(parsed_data)
            
            if not chunks:
                logger.warning(f"No chunks created for file: {file_path}")
                self.stats['skipped_files'] += 1
                return False
            
            # Add repository metadata to chunks
            for chunk in chunks:
                chunk['metadata']['repository'] = repo_name
                chunk['metadata']['file_path'] = str(file_path)
                chunk['metadata']['processed_at'] = datetime.now().isoformat()
            
            # Index chunks in vector store
            success = self.rag_engine.add_documents(chunks)
            
            if success:
                self.stats['processed_files'] += 1
                self.stats['total_chunks'] += len(chunks)
                
                # Mark file as processed
                self.mark_file_processed(file_path, repo_name, len(chunks), parsed_data.get('metadata', {}))
                
                logger.info(f"Successfully indexed {len(chunks)} chunks from {file_path}")
                return True
            else:
                logger.error(f"Failed to index chunks for file: {file_path}")
                self.stats['error_files'] += 1
                return False
                
        except Exception as e:
            logger.error(f"Error processing file {file_path}: {e}")
            self.stats['error_files'] += 1
            return False
    
    def analyze_external_repositories(self) -> bool:
        """Analyze external repositories configured in external_repos.json."""
        try:
            config = self.load_external_repos_config()
            repositories = config.get('repositories', [])
            
            if not repositories:
                logger.warning("No external repositories configured")
                return False
            
            logger.info(f"Found {len(repositories)} external repositories to analyze")
            
            success_count = 0
            for i, repo_config in enumerate(repositories):
                logger.info(f"Processing repository {i+1}/{len(repositories)}: {repo_config['name']}")
                
                try:
                    # Clone repository
                    repo_path = self.clone_repository(
                        repo_config['url'], 
                        repo_config.get('branch', 'main')
                    )
                    
                    if repo_path:
                        # Analyze cloned repository
                        include_patterns = repo_config.get('include_patterns', ['*.py', '*.js', '*.ts', '*.java', '*.cpp', '*.c', '*.go', '*.rs'])
                        exclude_patterns = repo_config.get('exclude_patterns', ['test*', 'node_modules', '*.min.js'])
                        
                        if self.analyze_local_repository(
                            repo_path, 
                            repo_config['name'],
                            include_patterns,
                            exclude_patterns
                        ):
                            success_count += 1
                        
                        # Clean up cloned repository
                        if repo_path.exists():
                            shutil.rmtree(repo_path)
                    
                except Exception as e:
                    logger.error(f"Error processing repository {repo_config['name']}: {e}")
            
            logger.info(f"Successfully processed {success_count}/{len(repositories)} external repositories")
            return success_count > 0
            
        except Exception as e:
            logger.error(f"Error analyzing external repositories: {e}")
            return False
    
    def show_statistics(self) -> None:
        """Display processing statistics."""
        print("\n" + "="*50)
        print("REPOSITORY ANALYSIS STATISTICS")
        print("="*50)
        print(f"Total files found: {self.stats['total_files']}")
        print(f"Files processed: {self.stats['processed_files']}")
        print(f"Files skipped: {self.stats['skipped_files']}")
        print(f"Files with errors: {self.stats['error_files']}")
        print(f"Total chunks created: {self.stats['total_chunks']}")
        print(f"Processing time: {self.stats['processing_time']:.2f} seconds")
        
        if self.stats['total_files'] > 0:
            success_rate = (self.stats['processed_files'] / self.stats['total_files']) * 100
            print(f"Success rate: {success_rate:.1f}%")
        
        print("="*50)
    
    def save_statistics(self, output_file: Optional[str] = None) -> None:
        """Save statistics to file."""
        if output_file is None:
            timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
            output_file = self.logs_dir / f"analysis_stats_{timestamp}.json"
        
        try:
            stats_data = {
                'timestamp': datetime.now().isoformat(),
                'statistics': self.stats,
                'config': self.config
            }
            
            with open(output_file, 'w') as f:
                json.dump(stats_data, f, indent=2)
            
            logger.info(f"Statistics saved to: {output_file}")
            
        except Exception as e:
            logger.error(f"Error saving statistics: {e}")
    
    def reset_processed_files(self, repo_name: Optional[str] = None) -> bool:
        """Reset processed files tracking."""
        try:
            if repo_name:
                # Remove processed files for specific repository
                pattern = f"{repo_name}_*.json"
                for processed_file in self.processed_dir.glob(pattern):
                    processed_file.unlink()
                    logger.info(f"Removed processed file: {processed_file}")
            else:
                # Remove all processed files
                for processed_file in self.processed_dir.glob("*.json"):
                    processed_file.unlink()
                    logger.info(f"Removed processed file: {processed_file}")
            
            logger.info("Processed files reset completed")
            return True
            
        except Exception as e:
            logger.error(f"Error resetting processed files: {e}")
            return False

def main():
    """Main function for command-line usage."""
    parser = argparse.ArgumentParser(description='Analyze and index code repositories')
    parser.add_argument('--config', default='rag_config.yaml', 
                       help='Path to configuration file')
    parser.add_argument('--local', nargs='+', 
                       help='Analyze local repository paths')
    parser.add_argument('--external', action='store_true', 
                       help='Analyze external repositories from config')
    parser.add_argument('--repo-name', 
                       help='Repository name (for local analysis)')
    parser.add_argument('--include-patterns', nargs='+', 
                       help='File patterns to include')
    parser.add_argument('--exclude-patterns', nargs='+', 
                       help='File patterns to exclude')
    parser.add_argument('--stats', action='store_true', 
                       help='Show processing statistics')
    parser.add_argument('--save-stats', 
                       help='Save statistics to file')
    parser.add_argument('--reset-processed', action='store_true', 
                       help='Reset processed files tracking')
    parser.add_argument('--reset-repo', 
                       help='Reset processed files for specific repository')
    parser.add_argument('--verbose', action='store_true', 
                       help='Enable verbose logging')
    
    args = parser.parse_args()
    
    if args.verbose:
        logging.getLogger().setLevel(logging.DEBUG)
    
    analyzer = RepositoryAnalyzer(args.config)
    
    # Reset processed files
    if args.reset_processed:
        success = analyzer.reset_processed_files()
        sys.exit(0 if success else 1)
    
    if args.reset_repo:
        success = analyzer.reset_processed_files(args.reset_repo)
        sys.exit(0 if success else 1)
    
    # Analyze local repositories
    if args.local:
        start_time = time.time()
        
        for repo_path in args.local:
            repo_path = Path(repo_path)
            analyzer.analyze_local_repository(
                repo_path,
                args.repo_name,
                args.include_patterns,
                args.exclude_patterns
            )
        
        analyzer.stats['processing_time'] = time.time() - start_time
        
        if args.stats:
            analyzer.show_statistics()
        
        if args.save_stats:
            analyzer.save_statistics(args.save_stats)
        
        sys.exit(0)
    
    # Analyze external repositories
    if args.external:
        start_time = time.time()
        
        success = analyzer.analyze_external_repositories()
        analyzer.stats['processing_time'] = time.time() - start_time
        
        if args.stats:
            analyzer.show_statistics()
        
        if args.save_stats:
            analyzer.save_statistics(args.save_stats)
        
        sys.exit(0 if success else 1)
    
    # Show statistics only
    if args.stats:
        analyzer.show_statistics()
        sys.exit(0)
    
    # Default action
    parser.print_help()
    sys.exit(1)

if __name__ == '__main__':
    main()