#!/usr/bin/env python3
"""
Maintenance script for the RAG Code Assistant system.

This script provides utilities for maintaining the vector database, cleaning up
old data, optimizing performance, and monitoring system health.
"""

import os
import sys
import json
import yaml
import logging
import argparse
import shutil
from pathlib import Path
from typing import Dict, List, Optional, Any
from datetime import datetime, timedelta
import time

# Add parent directory to path for imports
sys.path.append(str(Path(__file__).parent.parent))

from rag_engine import RAGEngine

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

class RAGMaintenance:
    """Handles maintenance operations for the RAG system."""
    
    def __init__(self, config_path: str = "rag_config.yaml"):
        """Initialize the maintenance system."""
        self.config_path = config_path
        self.config = self.load_config()
        self.project_root = Path(__file__).parent.parent
        
        # Setup directories
        self.data_dir = self.project_root / "data"
        self.external_repos_dir = self.project_root / "external_repos"
        self.logs_dir = self.project_root / "logs"
        self.processed_data_dir = self.data_dir / "processed"
        self.backup_dir = self.data_dir / "backups"
        
        # Ensure directories exist
        self.backup_dir.mkdir(parents=True, exist_ok=True)
        
        # Initialize RAG engine
        self.rag_engine = RAGEngine(config_path)
        
        # Maintenance statistics
        self.maintenance_stats = {
            'operations_performed': [],
            'space_saved': 0,
            'items_cleaned': 0,
            'backup_created': False,
            'optimization_performed': False
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
    
    def create_backup(self, backup_name: Optional[str] = None) -> Dict:
        """Create a backup of the vector database and processed data."""
        try:
            timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
            backup_name = backup_name or f"backup_{timestamp}"
            backup_path = self.backup_dir / backup_name
            
            logger.info(f"Creating backup: {backup_name}")
            
            # Create backup directory
            backup_path.mkdir(parents=True, exist_ok=True)
            
            # Backup vector database
            vector_backup = backup_path / "vector_db"
            if self.rag_engine.vector_store:
                try:
                    # Export vector database
                    self.rag_engine.export_collection(str(vector_backup))
                    logger.info("Vector database backed up successfully")
                except Exception as e:
                    logger.warning(f"Could not backup vector database: {e}")
            
            # Backup processed data
            processed_backup = backup_path / "processed_data"
            if self.processed_data_dir.exists():
                shutil.copytree(
                    self.processed_data_dir,
                    processed_backup,
                    dirs_exist_ok=True
                )
                logger.info("Processed data backed up successfully")
            
            # Create backup manifest
            manifest = {
                'timestamp': datetime.now().isoformat(),
                'backup_name': backup_name,
                'vector_db_size': self.get_directory_size(vector_backup) if vector_backup.exists() else 0,
                'processed_data_size': self.get_directory_size(processed_backup) if processed_backup.exists() else 0,
                'total_size': self.get_directory_size(backup_path)
            }
            
            manifest_file = backup_path / "manifest.json"
            with open(manifest_file, 'w') as f:
                json.dump(manifest, f, indent=2)
            
            self.maintenance_stats['backup_created'] = True
            logger.info(f"Backup created successfully: {backup_path}")
            
            return {
                'status': 'success',
                'backup_path': str(backup_path),
                'manifest': manifest
            }
            
        except Exception as e:
            logger.error(f"Error creating backup: {e}")
            return {
                'status': 'failed',
                'error': str(e)
            }
    
    def restore_backup(self, backup_name: str) -> Dict:
        """Restore from a backup."""
        try:
            backup_path = self.backup_dir / backup_name
            
            if not backup_path.exists():
                logger.error(f"Backup not found: {backup_name}")
                return {
                    'status': 'failed',
                    'error': 'Backup not found'
                }
            
            logger.info(f"Restoring from backup: {backup_name}")
            
            # Load manifest
            manifest_file = backup_path / "manifest.json"
            if manifest_file.exists():
                with open(manifest_file, 'r') as f:
                    manifest = json.load(f)
                logger.info(f"Backup created at: {manifest['timestamp']}")
            
            # Restore vector database
            vector_backup = backup_path / "vector_db"
            if vector_backup.exists():
                try:
                    self.rag_engine.import_collection(str(vector_backup))
                    logger.info("Vector database restored successfully")
                except Exception as e:
                    logger.warning(f"Could not restore vector database: {e}")
            
            # Restore processed data
            processed_backup = backup_path / "processed_data"
            if processed_backup.exists():
                if self.processed_data_dir.exists():
                    shutil.rmtree(self.processed_data_dir)
                shutil.copytree(processed_backup, self.processed_data_dir)
                logger.info("Processed data restored successfully")
            
            logger.info(f"Restore completed successfully from: {backup_path}")
            
            return {
                'status': 'success',
                'backup_path': str(backup_path)
            }
            
        except Exception as e:
            logger.error(f"Error restoring backup: {e}")
            return {
                'status': 'failed',
                'error': str(e)
            }
    
    def list_backups(self) -> List[Dict]:
        """List available backups."""
        try:
            backups = []
            
            for backup_path in self.backup_dir.iterdir():
                if backup_path.is_dir():
                    manifest_file = backup_path / "manifest.json"
                    if manifest_file.exists():
                        with open(manifest_file, 'r') as f:
                            manifest = json.load(f)
                        backups.append(manifest)
                    else:
                        # Backup without manifest
                        backups.append({
                            'backup_name': backup_path.name,
                            'timestamp': 'unknown',
                            'total_size': self.get_directory_size(backup_path)
                        })
            
            # Sort by timestamp (newest first)
            backups.sort(key=lambda x: x.get('timestamp', ''), reverse=True)
            
            return backups
            
        except Exception as e:
            logger.error(f"Error listing backups: {e}")
            return []
    
    def cleanup_old_data(self, days_old: int = 30) -> Dict:
        """Clean up old processed data files."""
        try:
            logger.info(f"Cleaning up data older than {days_old} days")
            
            cutoff_date = datetime.now() - timedelta(days=days_old)
            cleaned_count = 0
            space_saved = 0
            
            # Clean up processed data directory
            if self.processed_data_dir.exists():
                for item in self.processed_data_dir.iterdir():
                    if item.is_file():
                        file_mtime = datetime.fromtimestamp(item.stat().st_mtime)
                        if file_mtime < cutoff_date:
                            file_size = item.stat().st_size
                            item.unlink()
                            cleaned_count += 1
                            space_saved += file_size
                            logger.debug(f"Deleted old file: {item.name}")
            
            # Clean up old logs
            if self.logs_dir.exists():
                for log_file in self.logs_dir.glob("*.log"):
                    file_mtime = datetime.fromtimestamp(log_file.stat().st_mtime)
                    if file_mtime < cutoff_date:
                        file_size = log_file.stat().st_size
                        log_file.unlink()
                        cleaned_count += 1
                        space_saved += file_size
                        logger.debug(f"Deleted old log: {log_file.name}")
            
            self.maintenance_stats['items_cleaned'] += cleaned_count
            self.maintenance_stats['space_saved'] += space_saved
            
            logger.info(f"Cleanup completed: {cleaned_count} items removed, {space_saved} bytes saved")
            
            return {
                'status': 'success',
                'items_cleaned': cleaned_count,
                'space_saved': space_saved
            }
            
        except Exception as e:
            logger.error(f"Error during cleanup: {e}")
            return {
                'status': 'failed',
                'error': str(e)
            }
    
    def optimize_vector_database(self) -> Dict:
        """Optimize the vector database for better performance."""
        try:
            logger.info("Optimizing vector database")
            
            # Get current collection stats
            before_stats = self.rag_engine.get_collection_stats()
            
            # Perform optimization
            optimization_result = self.rag_engine.optimize_collection()
            
            # Get stats after optimization
            after_stats = self.rag_engine.get_collection_stats()
            
            self.maintenance_stats['optimization_performed'] = True
            
            logger.info("Vector database optimization completed")
            
            return {
                'status': 'success',
                'before_stats': before_stats,
                'after_stats': after_stats,
                'optimization_details': optimization_result
            }
            
        except Exception as e:
            logger.error(f"Error optimizing vector database: {e}")
            return {
                'status': 'failed',
                'error': str(e)
            }
    
    def check_system_health(self) -> Dict:
        """Check the overall health of the RAG system."""
        try:
            logger.info("Performing system health check")
            
            health_report = {
                'timestamp': datetime.now().isoformat(),
                'components': {},
                'overall_status': 'healthy'
            }
            
            # Check vector database
            try:
                vector_stats = self.rag_engine.get_collection_stats()
                health_report['components']['vector_database'] = {
                    'status': 'healthy',
                    'details': vector_stats
                }
            except Exception as e:
                health_report['components']['vector_database'] = {
                    'status': 'unhealthy',
                    'error': str(e)
                }
                health_report['overall_status'] = 'degraded'
            
            # Check disk space
            try:
                disk_usage = shutil.disk_usage(self.project_root)
                disk_usage_percent = (disk_usage.used / disk_usage.total) * 100
                
                health_report['components']['disk_space'] = {
                    'status': 'healthy' if disk_usage_percent < 90 else 'warning',
                    'details': {
                        'total': disk_usage.total,
                        'used': disk_usage.used,
                        'free': disk_usage.free,
                        'usage_percent': disk_usage_percent
                    }
                }
                
                if disk_usage_percent >= 90:
                    health_report['overall_status'] = 'warning'
                    
            except Exception as e:
                health_report['components']['disk_space'] = {
                    'status': 'unknown',
                    'error': str(e)
                }
            
            # Check data directories
            directories_to_check = [
                ('data_directory', self.data_dir),
                ('external_repos', self.external_repos_dir),
                ('logs_directory', self.logs_dir),
                ('processed_data', self.processed_data_dir)
            ]
            
            for name, directory in directories_to_check:
                try:
                    if directory.exists():
                        dir_size = self.get_directory_size(directory)
                        file_count = len(list(directory.rglob('*'))) if directory.exists() else 0
                        
                        health_report['components'][name] = {
                            'status': 'healthy',
                            'details': {
                                'exists': True,
                                'size': dir_size,
                                'file_count': file_count
                            }
                        }
                    else:
                        health_report['components'][name] = {
                            'status': 'missing',
                            'details': {'exists': False}
                        }
                        
                except Exception as e:
                    health_report['components'][name] = {
                        'status': 'error',
                        'error': str(e)
                    }
            
            logger.info(f"System health check completed: {health_report['overall_status']}")
            
            return health_report
            
        except Exception as e:
            logger.error(f"Error during health check: {e}")
            return {
                'status': 'failed',
                'error': str(e)
            }
    
    def get_directory_size(self, path: Path) -> int:
        """Get the total size of a directory in bytes."""
        try:
            total_size = 0
            for item in path.rglob('*'):
                if item.is_file():
                    total_size += item.stat().st_size
            return total_size
        except Exception:
            return 0
    
    def show_statistics(self) -> None:
        """Display maintenance statistics."""
        try:
            stats_text = f"""
Maintenance Statistics:
=======================
Operations Performed: {len(self.maintenance_stats['operations_performed'])}
Space Saved: {self.maintenance_stats['space_saved']} bytes
Items Cleaned: {self.maintenance_stats['items_cleaned']}
Backup Created: {self.maintenance_stats['backup_created']}
Optimization Performed: {self.maintenance_stats['optimization_performed']}
"""
            print(stats_text)
            
        except Exception as e:
            logger.error(f"Error displaying statistics: {e}")

def main():
    """Main function for command-line usage."""
    parser = argparse.ArgumentParser(description='Maintain the RAG Code Assistant system')
    parser.add_argument('--config', default='rag_config.yaml', 
                       help='Path to configuration file')
    parser.add_argument('--backup', action='store_true', 
                       help='Create a backup of the system')
    parser.add_argument('--restore', 
                       help='Restore from backup (specify backup name)')
    parser.add_argument('--list-backups', action='store_true', 
                       help='List available backups')
    parser.add_argument('--cleanup', action='store_true', 
                       help='Clean up old data files')
    parser.add_argument('--cleanup-days', type=int, default=30, 
                       help='Age in days for cleanup (default: 30)')
    parser.add_argument('--optimize', action='store_true', 
                       help='Optimize vector database')
    parser.add_argument('--health-check', action='store_true', 
                       help='Perform system health check')
    parser.add_argument('--full-maintenance', action='store_true', 
                       help='Perform full maintenance (backup, cleanup, optimize)')
    parser.add_argument('--verbose', action='store_true', 
                       help='Enable verbose logging')
    
    args = parser.parse_args()
    
    if args.verbose:
        logging.getLogger().setLevel(logging.DEBUG)
    
    maintenance = RAGMaintenance(args.config)
    
    # Full maintenance mode
    if args.full_maintenance:
        logger.info("Starting full maintenance...")
        
        # Create backup
        backup_result = maintenance.create_backup()
        if backup_result['status'] == 'success':
            print(f"✓ Backup created: {backup_result['backup_path']}")
        
        # Clean up old data
        cleanup_result = maintenance.cleanup_old_data(args.cleanup_days)
        if cleanup_result['status'] == 'success':
            print(f"✓ Cleanup completed: {cleanup_result['items_cleaned']} items removed")
        
        # Optimize vector database
        optimize_result = maintenance.optimize_vector_database()
        if optimize_result['status'] == 'success':
            print("✓ Vector database optimized")
        
        # Health check
        health_result = maintenance.check_system_health()
        if health_result['status'] != 'failed':
            print(f"✓ System health: {health_result['overall_status']}")
        
        maintenance.show_statistics()
        return
    
    # Individual operations
    if args.backup:
        result = maintenance.create_backup()
        if result['status'] == 'success':
            print(f"Backup created successfully: {result['backup_path']}")
        else:
            print(f"Error creating backup: {result.get('error', 'Unknown error')}")
    
    if args.restore:
        result = maintenance.restore_backup(args.restore)
        if result['status'] == 'success':
            print(f"Restore completed successfully from: {result['backup_path']}")
        else:
            print(f"Error restoring backup: {result.get('error', 'Unknown error')}")
    
    if args.list_backups:
        backups = maintenance.list_backups()
        if backups:
            print("\nAvailable backups:")
            for backup in backups:
                print(f"  {backup['backup_name']} - {backup['timestamp']} - {backup['total_size']} bytes")
        else:
            print("No backups found.")
    
    if args.cleanup:
        result = maintenance.cleanup_old_data(args.cleanup_days)
        if result['status'] == 'success':
            print(f"Cleanup completed: {result['items_cleaned']} items removed, {result['space_saved']} bytes saved")
        else:
            print(f"Error during cleanup: {result.get('error', 'Unknown error')}")
    
    if args.optimize:
        result = maintenance.optimize_vector_database()
        if result['status'] == 'success':
            print("Vector database optimization completed")
            print(f"Before: {result['before_stats']}")
            print(f"After: {result['after_stats']}")
        else:
            print(f"Error optimizing vector database: {result.get('error', 'Unknown error')}")
    
    if args.health_check:
        result = maintenance.check_system_health()
        if result['status'] != 'failed':
            print(f"System health: {result['overall_status']}")
            print("\nComponent status:")
            for component, status in result['components'].items():
                print(f"  {component}: {status['status']}")
        else:
            print(f"Error during health check: {result.get('error', 'Unknown error')}")
    
    # Show statistics if any operation was performed
    if any([args.backup, args.restore, args.cleanup, args.optimize, args.full_maintenance]):
        maintenance.show_statistics()

if __name__ == '__main__':
    main()