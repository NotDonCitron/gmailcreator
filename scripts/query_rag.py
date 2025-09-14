#!/usr/bin/env python3
"""
Query script for the RAG Code Assistant system.

This script allows users to query the vector database and retrieve relevant code
snippets, documentation, and context from indexed repositories.
"""

import os
import sys
import json
import argparse
import logging
from pathlib import Path
from typing import List, Dict, Optional, Any
from datetime import datetime

# Add parent directory to path for imports
sys.path.append(str(Path(__file__).parent.parent))

from rag_engine import RAGEngine

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

class RAGQueryEngine:
    """Handles queries to the RAG system."""
    
    def __init__(self, config_path: str = "rag_config.yaml"):
        """Initialize the query engine."""
        self.config_path = config_path
        self.project_root = Path(__file__).parent.parent
        
        # Initialize RAG engine
        self.rag_engine = RAGEngine(config_path)
        
        # Query statistics
        self.query_stats = {
            'total_queries': 0,
            'successful_queries': 0,
            'failed_queries': 0,
            'average_response_time': 0,
            'total_response_time': 0
        }
    
    def query_code(self, query: str, top_k: int = 5, 
                   include_metadata: bool = True) -> Dict:
        """Query the vector database for code snippets."""
        try:
            logger.info(f"Processing query: {query}")
            start_time = datetime.now()
            
            # Perform similarity search
            results = self.rag_engine.similarity_search(query, top_k=top_k)
            
            if not results:
                logger.warning("No results found for query")
                return {
                    'status': 'no_results',
                    'query': query,
                    'results': [],
                    'response_time': (datetime.now() - start_time).total_seconds()
                }
            
            # Format results
            formatted_results = []
            for i, result in enumerate(results, 1):
                result_data = {
                    'rank': i,
                    'content': result.get('content', ''),
                    'score': result.get('score', 0.0),
                    'metadata': result.get('metadata', {}) if include_metadata else {}
                }
                formatted_results.append(result_data)
            
            response_time = (datetime.now() - start_time).total_seconds()
            
            # Update statistics
            self.query_stats['total_queries'] += 1
            self.query_stats['successful_queries'] += 1
            self.query_stats['total_response_time'] += response_time
            self.query_stats['average_response_time'] = (
                self.query_stats['total_response_time'] / self.query_stats['successful_queries']
            )
            
            logger.info(f"Query completed in {response_time:.2f}s, found {len(results)} results")
            
            return {
                'status': 'success',
                'query': query,
                'results': formatted_results,
                'total_results': len(formatted_results),
                'response_time': response_time
            }
            
        except Exception as e:
            logger.error(f"Error processing query: {e}")
            
            # Update statistics
            self.query_stats['total_queries'] += 1
            self.query_stats['failed_queries'] += 1
            
            return {
                'status': 'failed',
                'query': query,
                'error': str(e),
                'results': [],
                'response_time': 0
            }
    
    def query_with_context(self, query: str, context_type: str = 'code',
                          top_k: int = 5) -> Dict:
        """Query with specific context type (code, documentation, etc.)."""
        try:
            logger.info(f"Processing context query: {query} (type: {context_type})")
            
            # Add context-specific filters to query
            context_query = f"{query} type:{context_type}"
            
            return self.query_code(context_query, top_k=top_k)
            
        except Exception as e:
            logger.error(f"Error processing context query: {e}")
            return {
                'status': 'failed',
                'query': query,
                'context_type': context_type,
                'error': str(e),
                'results': []
            }
    
    def query_by_repository(self, query: str, repository: str, 
                           top_k: int = 5) -> Dict:
        """Query within a specific repository."""
        try:
            logger.info(f"Processing repository-specific query: {query} (repo: {repository})")
            
            # Add repository filter to query
            repo_query = f"{query} repository:{repository}"
            
            return self.query_code(repo_query, top_k=top_k)
            
        except Exception as e:
            logger.error(f"Error processing repository query: {e}")
            return {
                'status': 'failed',
                'query': query,
                'repository': repository,
                'error': str(e),
                'results': []
            }
    
    def query_by_file_type(self, query: str, file_extension: str, 
                          top_k: int = 5) -> Dict:
        """Query within files of a specific type."""
        try:
            logger.info(f"Processing file type query: {query} (extension: {file_extension})")
            
            # Add file type filter to query
            type_query = f"{query} file_type:{file_extension}"
            
            return self.query_code(type_query, top_k=top_k)
            
        except Exception as e:
            logger.error(f"Error processing file type query: {e}")
            return {
                'status': 'failed',
                'query': query,
                'file_extension': file_extension,
                'error': str(e),
                'results': []
            }
    
    def interactive_query(self):
        """Run interactive query mode."""
        print("\n=== RAG Code Assistant - Interactive Mode ===")
        print("Enter your queries below. Type 'quit' or 'exit' to stop.")
        print("Available commands:")
        print("  repo:<repository_name> - Query specific repository")
        print("  type:<file_extension> - Query specific file type")
        print("  context:<type> - Query with specific context")
        print("  top:<number> - Set number of results to return")
        print("  help - Show this help message")
        print("=" * 50)
        
        current_repo = None
        current_type = None
        current_context = None
        current_top_k = 5
        
        while True:
            try:
                # Get user input
                query_input = input("\nQuery: ").strip()
                
                if not query_input:
                    continue
                
                # Check for exit commands
                if query_input.lower() in ['quit', 'exit', 'q']:
                    print("Goodbye!")
                    break
                
                # Check for help command
                if query_input.lower() == 'help':
                    print("\nAvailable commands:")
                    print("  repo:<repository_name> - Query specific repository")
                    print("  type:<file_extension> - Query specific file type")
                    print("  context:<type> - Query with specific context")
                    print("  top:<number> - Set number of results to return")
                    print("  help - Show this help message")
                    print("  quit/exit - Exit interactive mode")
                    continue
                
                # Parse command modifiers
                query = query_input
                repo_filter = current_repo
                type_filter = current_type
                context_filter = current_context
                top_k = current_top_k
                
                # Extract command modifiers
                parts = query.split()
                filtered_parts = []
                
                for part in parts:
                    if part.startswith('repo:'):
                        repo_filter = part[5:]
                        print(f"Repository filter set to: {repo_filter}")
                    elif part.startswith('type:'):
                        type_filter = part[5:]
                        print(f"File type filter set to: {type_filter}")
                    elif part.startswith('context:'):
                        context_filter = part[8:]
                        print(f"Context filter set to: {context_filter}")
                    elif part.startswith('top:'):
                        try:
                            top_k = int(part[4:])
                            print(f"Results limit set to: {top_k}")
                        except ValueError:
                            print("Invalid top value, using default")
                    else:
                        filtered_parts.append(part)
                
                query = ' '.join(filtered_parts)
                
                if not query:
                    continue
                
                # Apply filters
                if repo_filter:
                    result = self.query_by_repository(query, repo_filter, top_k)
                elif type_filter:
                    result = self.query_by_file_type(query, type_filter, top_k)
                elif context_filter:
                    result = self.query_with_context(query, context_filter, top_k)
                else:
                    result = self.query_code(query, top_k)
                
                # Display results
                if result['status'] == 'success':
                    print(f"\nFound {result['total_results']} results in {result['response_time']:.2f}s:")
                    print("-" * 50)
                    
                    for i, res in enumerate(result['results'], 1):
                        print(f"\nResult {i} (Score: {res['score']:.3f}):")
                        print(f"Content: {res['content'][:200]}...")
                        
                        if res['metadata']:
                            print("Metadata:")
                            for key, value in res['metadata'].items():
                                if key not in ['content', 'embedding']:
                                    print(f"  {key}: {value}")
                        
                        print("-" * 30)
                
                elif result['status'] == 'no_results':
                    print("No results found for your query.")
                
                else:
                    print(f"Error: {result.get('error', 'Unknown error')}")
                
                # Update current filters
                current_repo = repo_filter
                current_type = type_filter
                current_context = context_filter
                current_top_k = top_k
                
            except KeyboardInterrupt:
                print("\nGoodbye!")
                break
            except Exception as e:
                logger.error(f"Error in interactive mode: {e}")
                print(f"Error: {e}")
    
    def show_statistics(self) -> None:
        """Display query statistics."""
        try:
            stats_text = f"""
Query Statistics:
=================
Total Queries: {self.query_stats['total_queries']}
Successful Queries: {self.query_stats['successful_queries']}
Failed Queries: {self.query_stats['failed_queries']}
Average Response Time: {self.query_stats['average_response_time']:.3f}s
Total Response Time: {self.query_stats['total_response_time']:.3f}s

Success Rate: {(self.query_stats['successful_queries'] / max(1, self.query_stats['total_queries']) * 100):.1f}%
"""
            print(stats_text)
            
        except Exception as e:
            logger.error(f"Error displaying statistics: {e}")

def main():
    """Main function for command-line usage."""
    parser = argparse.ArgumentParser(description='Query the RAG Code Assistant system')
    parser.add_argument('--config', default='rag_config.yaml', 
                       help='Path to configuration file')
    parser.add_argument('--query', 
                       help='Query string to search for')
    parser.add_argument('--repository', 
                       help='Filter by specific repository')
    parser.add_argument('--file-type', 
                       help='Filter by file extension (e.g., py, js, ts)')
    parser.add_argument('--context', 
                       help='Filter by context type (code, documentation, etc.)')
    parser.add_argument('--top-k', type=int, default=5, 
                       help='Number of top results to return')
    parser.add_argument('--interactive', action='store_true', 
                       help='Run in interactive mode')
    parser.add_argument('--verbose', action='store_true', 
                       help='Enable verbose logging')
    
    args = parser.parse_args()
    
    if args.verbose:
        logging.getLogger().setLevel(logging.DEBUG)
    
    query_engine = RAGQueryEngine(args.config)
    
    # Interactive mode
    if args.interactive:
        query_engine.interactive_query()
        return
    
    # Single query mode
    if not args.query:
        print("Error: --query is required (unless using --interactive mode)")
        return
    
    try:
        # Apply filters based on arguments
        if args.repository:
            result = query_engine.query_by_repository(args.query, args.repository, args.top_k)
        elif args.file_type:
            result = query_engine.query_by_file_type(args.query, args.file_type, args.top_k)
        elif args.context:
            result = query_engine.query_with_context(args.query, args.context, args.top_k)
        else:
            result = query_engine.query_code(args.query, args.top_k)
        
        # Display results
        if result['status'] == 'success':
            print(f"\nQuery: {result['query']}")
            print(f"Found {result['total_results']} results in {result['response_time']:.2f}s:")
            print("=" * 60)
            
            for i, res in enumerate(result['results'], 1):
                print(f"\nResult {i} (Score: {res['score']:.3f}):")
                print(f"Content: {res['content'][:300]}...")
                
                if res['metadata']:
                    print("Metadata:")
                    for key, value in res['metadata'].items():
                        if key not in ['content', 'embedding']:
                            print(f"  {key}: {value}")
                
                print("-" * 40)
        
        elif result['status'] == 'no_results':
            print("No results found for your query.")
        
        else:
            print(f"Error: {result.get('error', 'Unknown error')}")
        
        # Show statistics
        query_engine.show_statistics()
        
    except Exception as e:
        logger.error(f"Error in main execution: {e}")
        print(f"Error: {e}")

if __name__ == '__main__':
    main()