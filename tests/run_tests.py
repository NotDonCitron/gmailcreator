#!/usr/bin/env python3
"""
Test runner script for the RAG system test suite.

This script provides a unified interface to run all tests, specific test modules,
or individual test cases with various options for reporting and coverage.
"""

import os
import sys
import argparse
import subprocess
import json
from pathlib import Path
from datetime import datetime

def run_command(cmd, cwd=None):
    """Run a command and return the result."""
    try:
        result = subprocess.run(
            cmd, 
            shell=True, 
            cwd=cwd, 
            capture_output=True, 
            text=True,
            check=False
        )
        return result.returncode, result.stdout, result.stderr
    except Exception as e:
        return -1, "", str(e)

def discover_tests(test_dir):
    """Discover all test files in the test directory."""
    test_files = []
    for file_path in Path(test_dir).glob("test_*.py"):
        test_files.append(str(file_path))
    return sorted(test_files)

def run_tests_with_coverage(test_files, coverage_report=False, verbose=False):
    """Run tests with optional coverage reporting."""
    cmd_parts = ["python", "-m", "pytest"]
    
    if verbose:
        cmd_parts.append("-v")
    
    if coverage_report:
        cmd_parts.extend(["--cov=.", "--cov-report=term-missing", "--cov-report=html"])
    
    cmd_parts.extend(test_files)
    
    return run_command(" ".join(cmd_parts))

def run_specific_test(test_file, test_name=None, verbose=False):
    """Run a specific test file or test case."""
    cmd_parts = ["python", "-m", "pytest"]
    
    if verbose:
        cmd_parts.append("-v")
    
    if test_name:
        cmd_parts.append(f"{test_file}::{test_name}")
    else:
        cmd_parts.append(test_file)
    
    return run_command(" ".join(cmd_parts))

def generate_test_report(results, output_file=None):
    """Generate a test report."""
    report = {
        "timestamp": datetime.now().isoformat(),
        "total_tests": len(results),
        "passed": sum(1 for r in results if r["returncode"] == 0),
        "failed": sum(1 for r in results if r["returncode"] != 0),
        "results": results
    }
    
    report_text = f"""
Test Execution Report
====================
Generated: {report['timestamp']}
Total Tests: {report['total_tests']}
Passed: {report['passed']}
Failed: {report['failed']}
Success Rate: {(report['passed'] / report['total_tests'] * 100):.1f}%

Detailed Results:
----------------
"""
    
    for result in results:
        status = "PASS" if result["returncode"] == 0 else "FAIL"
        report_text += f"\n{result['name']}: {status}"
        if result["returncode"] != 0:
            report_text += f"\n  Error: {result.get('stderr', 'Unknown error')}"
    
    if output_file:
        with open(output_file, 'w') as f:
            f.write(report_text)
        print(f"Report saved to: {output_file}")
    
    return report_text

def main():
    """Main function to run tests."""
    parser = argparse.ArgumentParser(description="Run RAG system tests")
    parser.add_argument(
        "--test-dir", 
        default="tests", 
        help="Directory containing test files (default: tests)"
    )
    parser.add_argument(
        "--test-file", 
        help="Specific test file to run (e.g., test_rag_engine.py)"
    )
    parser.add_argument(
        "--test-name", 
        help="Specific test name to run (requires --test-file)"
    )
    parser.add_argument(
        "--coverage", 
        action="store_true", 
        help="Generate coverage report"
    )
    parser.add_argument(
        "--verbose", 
        "-v", 
        action="store_true", 
        help="Verbose output"
    )
    parser.add_argument(
        "--report", 
        help="Generate test report file (e.g., test_report.txt)"
    )
    parser.add_argument(
        "--list", 
        action="store_true", 
        help="List available test files"
    )
    parser.add_argument(
        "--integration-only", 
        action="store_true", 
        help="Run only integration tests"
    )
    parser.add_argument(
        "--unit-only", 
        action="store_true", 
        help="Run only unit tests"
    )
    
    args = parser.parse_args()
    
    # Change to project root directory
    project_root = Path(__file__).parent.parent
    os.chdir(project_root)
    
    # Add project root to Python path
    sys.path.insert(0, str(project_root))
    
    # List available tests
    if args.list:
        test_files = discover_tests(args.test_dir)
        print("Available test files:")
        for test_file in test_files:
            print(f"  - {Path(test_file).name}")
        return
    
    # Determine which tests to run
    if args.test_file:
        # Run specific test file
        test_file_path = Path(args.test_dir) / args.test_file
        if not test_file_path.exists():
            print(f"Error: Test file {test_file_path} not found")
            return 1
        
        print(f"Running specific test: {test_file_path}")
        if args.test_name:
            returncode, stdout, stderr = run_specific_test(
                str(test_file_path), 
                args.test_name, 
                args.verbose
            )
        else:
            returncode, stdout, stderr = run_specific_test(
                str(test_file_path), 
                verbose=args.verbose
            )
        
        print(stdout)
        if stderr:
            print("Errors:", stderr)
        
        return returncode
    
    # Run all tests or filtered tests
    test_files = discover_tests(args.test_dir)
    
    if not test_files:
        print(f"No test files found in {args.test_dir}")
        return 1
    
    # Filter tests based on type
    if args.integration_only:
        test_files = [f for f in test_files if 'integration' in f]
    elif args.unit_only:
        test_files = [f for f in test_files if 'integration' not in f]
    
    if not test_files:
        print("No tests match the specified criteria")
        return 1
    
    print(f"Running {len(test_files)} test files...")
    
    # Run tests
    results = []
    for test_file in test_files:
        print(f"\nRunning {Path(test_file).name}...")
        returncode, stdout, stderr = run_tests_with_coverage(
            [test_file], 
            args.coverage, 
            args.verbose
        )
        
        result = {
            "name": Path(test_file).name,
            "returncode": returncode,
            "stdout": stdout,
            "stderr": stderr
        }
        results.append(result)
        
        # Print output
        if args.verbose or returncode != 0:
            print(stdout)
            if stderr:
                print("Errors:", stderr)
    
    # Generate report
    if args.report:
        report_text = generate_test_report(results, args.report)
    else:
        report_text = generate_test_report(results)
    
    print("\n" + report_text)
    
    # Return appropriate exit code
    failed_tests = sum(1 for r in results if r["returncode"] != 0)
    return 1 if failed_tests > 0 else 0

if __name__ == "__main__":
    sys.exit(main())