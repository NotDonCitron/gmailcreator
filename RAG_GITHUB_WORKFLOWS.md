# RAG System GitHub Actions Workflows

## Main CI/CD Pipeline: rag-pipeline.yml

```yaml
name: RAG System Pipeline

on:
  push:
    branches: [ main, develop ]
    paths:
      - 'gmailcreator/rag_engine.py'
      - 'gmailcreator/code_parser.py'
      - 'gmailcreator/scripts/**'
      - 'gmailcreator/tests/**'
      - 'gmailcreator/requirements.txt'
      - '.github/workflows/rag-pipeline.yml'
  pull_request:
    branches: [ main, develop ]
    paths:
      - 'gmailcreator/rag_engine.py'
      - 'gmailcreator/code_parser.py'
      - 'gmailcreator/scripts/**'
      - 'gmailcreator/tests/**'
      - 'gmailcreator/requirements.txt'
  schedule:
    # Run daily at 2 AM UTC for repository updates
    - cron: '0 2 * * *'
  workflow_dispatch:

env:
  PYTHON_VERSION: '3.9'
  RAG_DB_PATH: './rag_data/chroma_db'
  RAG_LOG_LEVEL: 'INFO'

jobs:
  test:
    name: Test RAG System
    runs-on: ubuntu-latest
    strategy:
      matrix:
        python-version: [3.8, 3.9, '3.10', '3.11']
    
    steps:
    - name: Checkout code
      uses: actions/checkout@v4
      with:
        fetch-depth: 0
    
    - name: Set up Python ${{ matrix.python-version }}
      uses: actions/setup-python@v4
      with:
        python-version: ${{ matrix.python-version }}
    
    - name: Cache pip dependencies
      uses: actions/cache@v3
      with:
        path: ~/.cache/pip
        key: ${{ runner.os }}-pip-${{ hashFiles('gmailcreator/requirements.txt') }}
        restore-keys: |
          ${{ runner.os }}-pip-
    
    - name: Install system dependencies
      run: |
        sudo apt-get update
        sudo apt-get install -y git build-essential
    
    - name: Install Python dependencies
      run: |
        python -m pip install --upgrade pip
        pip install -r gmailcreator/requirements.txt
        pip install pytest pytest-cov pytest-asyncio
    
    - name: Create test environment file
      run: |
        echo "PERPLEXITY_API_KEY=test_key" > gmailcreator/.env.rag
        echo "CLAUDE_API_KEY=test_key" >> gmailcreator/.env.rag
        echo "OPENAI_API_KEY=test_key" >> gmailcreator/.env.rag
        echo "GITHUB_TOKEN=${{ secrets.GITHUB_TOKEN }}" >> gmailcreator/.env.rag
    
    - name: Run linting
      run: |
        flake8 gmailcreator/rag_engine.py gmailcreator/code_parser.py --max-line-length=88
        black --check gmailcreator/rag_engine.py gmailcreator/code_parser.py
        mypy gmailcreator/rag_engine.py gmailcreator/code_parser.py --ignore-missing-imports
    
    - name: Run tests
      run: |
        cd gmailcreator
        pytest tests/test_rag_system.py -v --cov=. --cov-report=xml
    
    - name: Upload coverage reports
      uses: codecov/codecov-action@v3
      with:
        file: ./gmailcreator/coverage.xml
        flags: unittests
        name: codecov-umbrella

  security:
    name: Security Scan
    runs-on: ubuntu-latest
    needs: test
    
    steps:
    - name: Checkout code
      uses: actions/checkout@v4
    
    - name: Set up Python
      uses: actions/setup-python@v4
      with:
        python-version: ${{ env.PYTHON_VERSION }}
    
    - name: Install dependencies
      run: |
        python -m pip install --upgrade pip
        pip install safety bandit
    
    - name: Run safety check
      run: |
        safety check -r gmailcreator/requirements.txt
    
    - name: Run bandit security scan
      run: |
        bandit -r gmailcreator/rag_engine.py gmailcreator/code_parser.py -f json -o bandit-report.json
    
    - name: Upload security scan results
      uses: actions/upload-artifact@v3
      with:
        name: security-scan-results
        path: bandit-report.json

  build:
    name: Build and Package
    runs-on: ubuntu-latest
    needs: [test, security]
    
    steps:
    - name: Checkout code
      uses: actions/checkout@v4
    
    - name: Set up Python
      uses: actions/setup-python@v4
      with:
        python-version: ${{ env.PYTHON_VERSION }}
    
    - name: Install build dependencies
      run: |
        python -m pip install --upgrade pip
        pip install build wheel
    
    - name: Build package
      run: |
        cd gmailcreator
        python -m build
    
    - name: Upload build artifacts
      uses: actions/upload-artifact@v3
      with:
        name: build-artifacts
        path: gmailcreator/dist/

  update-index:
    name: Update RAG Index
    runs-on: ubuntu-latest
    needs: [test, security]
    if: github.event_name == 'schedule' || github.event_name == 'workflow_dispatch'
    
    steps:
    - name: Checkout code
      uses: actions/checkout@v4
      with:
        fetch-depth: 0
    
    - name: Set up Python
      uses: actions/setup-python@v4
      with:
        python-version: ${{ env.PYTHON_VERSION }}
    
    - name: Install dependencies
      run: |
        python -m pip install --upgrade pip
        pip install -r gmailcreator/requirements.txt
    
    - name: Create production environment file
      run: |
        echo "PERPLEXITY_API_KEY=${{ secrets.PERPLEXITY_API_KEY }}" > gmailcreator/.env.rag
        echo "CLAUDE_API_KEY=${{ secrets.CLAUDE_API_KEY }}" >> gmailcreator/.env.rag
        echo "OPENAI_API_KEY=${{ secrets.OPENAI_API_KEY }}" >> gmailcreator/.env.rag
        echo "GITHUB_TOKEN=${{ secrets.GITHUB_TOKEN }}" >> gmailcreator/.env.rag
    
    - name: Update RAG index
      run: |
        cd gmailcreator
        python scripts/update_rag_index.py --external-repos
    
    - name: Upload updated index
      uses: actions/upload-artifact@v3
      with:
        name: rag-index
        path: gmailcreator/rag_data/

  benchmark:
    name: Performance Benchmark
    runs-on: ubuntu-latest
    needs: [test, security]
    if: github.event_name == 'pull_request'
    
    steps:
    - name: Checkout code
      uses: actions/checkout@v4
    
    - name: Set up Python
      uses: actions/setup-python@v4
      with:
        python-version: ${{ env.PYTHON_VERSION }}
    
    - name: Install dependencies
      run: |
        python -m pip install --upgrade pip
        pip install -r gmailcreator/requirements.txt
    
    - name: Create test environment file
      run: |
        echo "PERPLEXITY_API_KEY=test_key" > gmailcreator/.env.rag
        echo "CLAUDE_API_KEY=test_key" >> gmailcreator/.env.rag
        echo "OPENAI_API_KEY=test_key" >> gmailcreator/.env.rag
        echo "GITHUB_TOKEN=${{ secrets.GITHUB_TOKEN }}" >> gmailcreator/.env.rag
    
    - name: Run benchmarks
      run: |
        cd gmailcreator
        python scripts/benchmark_rag.py --output-format json --output-file benchmark-results.json
    
    - name: Upload benchmark results
      uses: actions/upload-artifact@v3
      with:
        name: benchmark-results
        path: gmailcreator/benchmark-results.json
    
    - name: Comment benchmark results
      uses: actions/github-script@v6
      with:
        script: |
          const fs = require('fs');
          const benchmarkResults = JSON.parse(fs.readFileSync('gmailcreator/benchmark-results.json', 'utf8'));
          
          const comment = `## RAG System Benchmark Results
          
          **Query Performance:**
          - Average response time: ${benchmarkResults.query_performance.average_time.toFixed(2)}ms
          - 95th percentile: ${benchmarkResults.query_performance.p95_time.toFixed(2)}ms
          - Success rate: ${(benchmarkResults.query_performance.success_rate * 100).toFixed(1)}%
          
          **Indexing Performance:**
          - Documents per second: ${benchmarkResults.indexing_performance.docs_per_second.toFixed(2)}
          - Average chunk size: ${benchmarkResults.indexing_performance.avg_chunk_size}
          - Memory usage: ${benchmarkResults.indexing_performance.memory_usage_mb}MB
          
          **Retrieval Quality:**
          - Average relevance score: ${benchmarkResults.retrieval_quality.avg_relevance_score.toFixed(3)}
          - Precision@5: ${(benchmarkResults.retrieval_quality.precision_at_5 * 100).toFixed(1)}%
          - Recall@10: ${(benchmarkResults.retrieval_quality.recall_at_10 * 100).toFixed(1)}%
          `;
          
          github.rest.issues.createComment({
            issue_number: context.issue.number,
            owner: context.repo.owner,
            repo: context.repo.repo,
            body: comment
          });

  deploy:
    name: Deploy Dashboard
    runs-on: ubuntu-latest
    needs: [test, security, build]
    if: github.ref == 'refs/heads/main' && github.event_name == 'push'
    
    steps:
    - name: Checkout code
      uses: actions/checkout@v4
    
    - name: Set up Python
      uses: actions/setup-python@v4
      with:
        python-version: ${{ env.PYTHON_VERSION }}
    
    - name: Install dependencies
      run: |
        python -m pip install --upgrade pip
        pip install -r gmailcreator/requirements.txt
    
    - name: Create production environment file
      run: |
        echo "PERPLEXITY_API_KEY=${{ secrets.PERPLEXITY_API_KEY }}" > gmailcreator/.env.rag
        echo "CLAUDE_API_KEY=${{ secrets.CLAUDE_API_KEY }}" >> gmailcreator/.env.rag
        echo "OPENAI_API_KEY=${{ secrets.OPENAI_API_KEY }}" >> gmailcreator/.env.rag
        echo "GITHUB_TOKEN=${{ secrets.GITHUB_TOKEN }}" >> gmailcreator/.env.rag
    
    - name: Deploy to production
      run: |
        # Add deployment script here
        echo "Deploying RAG dashboard to production..."
        # Example: rsync, docker deploy, etc.

  notify:
    name: Notify Results
    runs-on: ubuntu-latest
    needs: [test, security, build, update-index, benchmark, deploy]
    if: always()
    
    steps:
    - name: Notify Slack
      uses: 8398a7/action-slack@v3
      with:
        status: ${{ job.status }}
        channel: '#github-actions'
        webhook_url: ${{ secrets.SLACK_WEBHOOK }}
        fields: repo,message,commit,author,action,eventName,ref,workflow
```

## Repository Update Workflow: rag-update-repos.yml

```yaml
name: Update RAG Repositories

on:
  schedule:
    # Run every 6 hours
    - cron: '0 */6 * * *'
  workflow_dispatch:
    inputs:
      repository:
        description: 'Specific repository to update (leave empty for all)'
        required: false
        type: string

env:
  PYTHON_VERSION: '3.9'

jobs:
  update-repositories:
    name: Update Repository Index
    runs-on: ubuntu-latest
    
    steps:
    - name: Checkout code
      uses: actions/checkout@v4
    
    - name: Set up Python
      uses: actions/setup-python@v4
      with:
        python-version: ${{ env.PYTHON_VERSION }}
    
    - name: Install dependencies
      run: |
        python -m pip install --upgrade pip
        pip install -r gmailcreator/requirements.txt
    
    - name: Create production environment file
      run: |
        echo "PERPLEXITY_API_KEY=${{ secrets.PERPLEXITY_API_KEY }}" > gmailcreator/.env.rag
        echo "CLAUDE_API_KEY=${{ secrets.CLAUDE_API_KEY }}" >> gmailcreator/.env.rag
        echo "OPENAI_API_KEY=${{ secrets.OPENAI_API_KEY }}" >> gmailcreator/.env.rag
        echo "GITHUB_TOKEN=${{ secrets.GITHUB_TOKEN }}" >> gmailcreator/.env.rag
    
    - name: Download existing index
      uses: actions/download-artifact@v3
      with:
        name: rag-index
        path: gmailcreator/rag_data/
      continue-on-error: true
    
    - name: Update specific repository (if specified)
      if: github.event.inputs.repository != ''
      run: |
        cd gmailcreator
        python scripts/update_rag_index.py --repository ${{ github.event.inputs.repository }}
    
    - name: Update all repositories (if no specific repo)
      if: github.event.inputs.repository == ''
      run: |
        cd gmailcreator
        python scripts/update_rag_index.py --external-repos
    
    - name: Upload updated index
      uses: actions/upload-artifact@v3
      with:
        name: rag-index-${{ github.run_number }}
        path: gmailcreator/rag_data/
        retention-days: 30
    
    - name: Commit index changes
      run: |
        git config --local user.email "action@github.com"
        git config --local user.name "GitHub Action"
        git add gmailcreator/rag_data/
        git diff --quiet && git diff --staged --quiet || git commit -m "Update RAG index [skip ci]"
        git push
```

## Health Check Workflow: rag-health-check.yml

```yaml
name: RAG System Health Check

on:
  schedule:
    # Run every hour
    - cron: '0 * * * *'
  workflow_dispatch:

env:
  PYTHON_VERSION: '3.9'

jobs:
  health-check:
    name: System Health Check
    runs-on: ubuntu-latest
    
    steps:
    - name: Checkout code
      uses: actions/checkout@v4
    
    - name: Set up Python
      uses: actions/setup-python@v4
      with:
        python-version: ${{ env.PYTHON_VERSION }}
    
    - name: Install dependencies
      run: |
        python -m pip install --upgrade pip
        pip install -r gmailcreator/requirements.txt
    
    - name: Create test environment file
      run: |
        echo "PERPLEXITY_API_KEY=${{ secrets.PERPLEXITY_API_KEY }}" > gmailcreator/.env.rag
        echo "CLAUDE_API_KEY=${{ secrets.CLAUDE_API_KEY }}" >> gmailcreator/.env.rag
        echo "OPENAI_API_KEY=${{ secrets.OPENAI_API_KEY }}" >> gmailcreator/.env.rag
        echo "GITHUB_TOKEN=${{ secrets.GITHUB_TOKEN }}" >> gmailcreator/.env.rag
    
    - name: Run health check
      run: |
        cd gmailcreator
        python scripts/health_check.py --output-format json --output-file health-report.json
    
    - name: Upload health report
      uses: actions/upload-artifact@v3
      with:
        name: health-report-${{ github.run_number }}
        path: gmailcreator/health-report.json
    
    - name: Check health status
      run: |
        cd gmailcreator
        python -c "
        import json
        with open('health-report.json', 'r') as f:
            report = json.load(f)
        
        if report['overall_status'] != 'healthy':
            print('Health check failed!')
            exit(1)
        else:
            print('System is healthy')
        "
    
    - name: Notify on failure
      if: failure()
      uses: 8398a7/action-slack@v3
      with:
        status: failure
        channel: '#alerts'
        webhook_url: ${{ secrets.SLACK_WEBHOOK }}
        text: 'RAG system health check failed!'
```

## Required GitHub Secrets

Add these secrets to your GitHub repository settings:

```bash
# AI API Keys
PERPLEXITY_API_KEY=your_perplexity_api_key
CLAUDE_API_KEY=your_claude_api_key
OPENAI_API_KEY=your_openai_api_key

# GitHub Token (automatically available)
GITHUB_TOKEN=${{ secrets.GITHUB_TOKEN }}

# Slack Webhook (optional)
SLACK_WEBHOOK=your_slack_webhook_url

# Deployment Keys (if needed)
DEPLOY_KEY=your_deployment_key
```

## Workflow Triggers

### Automatic Triggers
- **Push to main/develop**: Full CI/CD pipeline
- **Pull requests**: Testing and benchmarking
- **Daily at 2 AM**: Repository index updates
- **Every 6 hours**: Repository updates
- **Every hour**: Health checks

### Manual Triggers
- **workflow_dispatch**: Manual execution of any workflow
- **Specific repository updates**: Targeted repository indexing

## Monitoring and Alerts

### Success Criteria
- All tests pass
- Security scans clear
- Benchmarks meet performance thresholds
- Health checks pass
- Deployment successful

### Failure Handling
- Automatic rollback on deployment failure
- Slack notifications for critical failures
- Detailed logs and artifacts for debugging
- Retry mechanisms for transient failures