# RAG System Environment Configuration

## Environment Variables

### AI API Keys
```bash
# Perplexity API Configuration
PERPLEXITY_API_KEY=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
PERPLEXITY_MODEL=llama-3.1-sonar-large-128k-online
PERPLEXITY_MAX_TOKENS=4096
PERPLEXITY_TEMPERATURE=0.1

# Claude API Configuration
CLAUDE_API_KEY=your_claude_api_key_here
CLAUDE_MODEL=claude-3-5-sonnet-20241022
CLAUDE_MAX_TOKENS=4096
CLAUDE_TEMPERATURE=0.1

# OpenAI API Configuration
OPENAI_API_KEY=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
OPENAI_MODEL=gpt-4o-mini
OPENAI_MAX_TOKENS=4096
OPENAI_TEMPERATURE=0.1
```

### GitHub Configuration
```bash
# GitHub API Access
GITHUB_TOKEN=your_github_token_here
GITHUB_API_VERSION=2022-11-28
GITHUB_RATE_LIMIT_DELAY=1.0
```

### Database Configuration
```bash
# ChromaDB Configuration
RAG_DB_PATH=./rag_data/chroma_db
RAG_DB_COLLECTION_NAME=codebase_knowledge
RAG_DB_EMBEDDING_MODEL=sentence-transformers/all-MiniLM-L6-v2
RAG_DB_CHUNK_SIZE=1000
RAG_DB_CHUNK_OVERLAP=200
```

### Dashboard Configuration
```bash
# Streamlit Dashboard
RAG_DASHBOARD_PORT=8501
RAG_DASHBOARD_HOST=localhost
RAG_DASHBOARD_DEBUG=false
```

### Logging Configuration
```bash
# RAG System Logging
RAG_LOG_LEVEL=INFO
RAG_LOG_FILE=./logs/rag_system.log
RAG_LOG_MAX_SIZE=10MB
RAG_LOG_BACKUP_COUNT=5
RAG_LOG_FORMAT=%(asctime)s - %(name)s - %(levelname)s - %(message)s
```

### Performance Configuration
```bash
# RAG Performance Settings
RAG_MAX_WORKERS=4
RAG_BATCH_SIZE=100
RAG_CACHE_SIZE=1000
RAG_TIMEOUT=300
RAG_RETRY_ATTEMPTS=3
RAG_RETRY_DELAY=5.0
```

### Repository Configuration
```bash
# Repository Analysis
REPO_ANALYSIS_DEPTH=3
REPO_INCLUDE_PATTERNS=*.py,*.js,*.ts,*.md,*.json,*.yaml,*.yml
REPO_EXCLUDE_PATTERNS=*.pyc,*.log,node_modules/,__pycache__/,*.git
REPO_MAX_FILE_SIZE=1048576
```

### MCP (Model Context Protocol) Configuration
```bash
# MCP Server Settings
MCP_SERVER_PORT=8080
MCP_SERVER_HOST=localhost
MCP_MAX_CONNECTIONS=10
MCP_TIMEOUT=60
```

## Configuration File: rag_config.yaml

```yaml
# RAG System Configuration
system:
  name: "GmailCreator RAG System"
  version: "1.0.0"
  environment: "development"

# AI Model Configuration
ai_models:
  perplexity:
    api_key: "${PERPLEXITY_API_KEY}"
    model: "${PERPLEXITY_MODEL}"
    max_tokens: "${PERPLEXITY_MAX_TOKENS}"
    temperature: "${PERPLEXITY_TEMPERATURE}"
  
  claude:
    api_key: "${CLAUDE_API_KEY}"
    model: "${CLAUDE_MODEL}"
    max_tokens: "${CLAUDE_MAX_TOKENS}"
    temperature: "${CLAUDE_TEMPERATURE}"
  
  openai:
    api_key: "${OPENAI_API_KEY}"
    model: "${OPENAI_MODEL}"
    max_tokens: "${OPENAI_MAX_TOKENS}"
    temperature: "${OPENAI_TEMPERATURE}"

# Database Configuration
database:
  chromadb:
    path: "${RAG_DB_PATH}"
    collection_name: "${RAG_DB_COLLECTION_NAME}"
    embedding_model: "${RAG_DB_EMBEDDING_MODEL}"
    chunk_size: "${RAG_DB_CHUNK_SIZE}"
    chunk_overlap: "${RAG_DB_CHUNK_OVERLAP}"

# Repository Configuration
repositories:
  external:
    - name: "puppeteer"
      url: "https://github.com/puppeteer/puppeteer"
      branch: "main"
      include_patterns: ["*.js", "*.md", "*.json"]
      exclude_patterns: ["node_modules", "test", "docs"]
    
    - name: "puppeteer-extra"
      url: "https://github.com/berstend/puppeteer-extra"
      branch: "master"
      include_patterns: ["*.js", "*.md", "*.json"]
      exclude_patterns: ["node_modules", "test", "docs"]
  
  local:
    - name: "gmailcreator"
      path: "."
      include_patterns: ["*.js", "*.md", "*.json", "*.yaml"]
      exclude_patterns: ["node_modules", "logs", "temp"]

# Code Parser Configuration
code_parser:
  languages:
    - name: "javascript"
      extensions: [".js", ".jsx", ".ts", ".tsx"]
      parser: "babel"
    
    - name: "python"
      extensions: [".py"]
      parser: "ast"
    
    - name: "json"
      extensions: [".json"]
      parser: "json"
  
  chunking:
    method: "semantic"
    max_chunk_size: 1000
    overlap: 200
    min_chunk_size: 100

# Dashboard Configuration
dashboard:
  streamlit:
    port: "${RAG_DASHBOARD_PORT}"
    host: "${RAG_DASHBOARD_HOST}"
    debug: "${RAG_DASHBOARD_DEBUG}"
  
  pages:
    - name: "Overview"
      path: "/"
      description: "System overview and statistics"
    
    - name: "Query"
      path: "/query"
      description: "Interactive RAG queries"
    
    - name: "Repositories"
      path: "/repositories"
      description: "Repository management and status"
    
    - name: "Settings"
      path: "/settings"
      description: "System configuration"

# Logging Configuration
logging:
  level: "${RAG_LOG_LEVEL}"
  file: "${RAG_LOG_FILE}"
  max_size: "${RAG_LOG_MAX_SIZE}"
  backup_count: "${RAG_LOG_BACKUP_COUNT}"
  format: "${RAG_LOG_FORMAT}"

# Performance Configuration
performance:
  max_workers: "${RAG_MAX_WORKERS}"
  batch_size: "${RAG_BATCH_SIZE}"
  cache_size: "${RAG_CACHE_SIZE}"
  timeout: "${RAG_TIMEOUT}"
  retry_attempts: "${RAG_RETRY_ATTEMPTS}"
  retry_delay: "${RAG_RETRY_DELAY}"

# MCP Configuration
mcp:
  server:
    port: "${MCP_SERVER_PORT}"
    host: "${MCP_SERVER_HOST}"
    max_connections: "${MCP_MAX_CONNECTIONS}"
    timeout: "${MCP_TIMEOUT}"
  
  endpoints:
    - name: "query"
      path: "/query"
      method: "POST"
      description: "Query the RAG system"
    
    - name: "index"
      path: "/index"
      method: "POST"
      description: "Index a repository"
    
    - name: "status"
      path: "/status"
      method: "GET"
      description: "Get system status"

# Security Configuration
security:
  api_keys:
    required: true
    validation: "header"
  
  rate_limiting:
    enabled: true
    requests_per_minute: 60
    burst_size: 10
  
  cors:
    enabled: true
    origins: ["http://localhost:3000", "http://localhost:8501"]
```

## External Repositories Configuration: external_repos.json

```json
{
  "repositories": [
    {
      "name": "puppeteer",
      "url": "https://github.com/puppeteer/puppeteer",
      "branch": "main",
      "description": "Headless Chrome Node.js API",
      "include_patterns": ["*.js", "*.md", "*.json", "*.ts"],
      "exclude_patterns": ["node_modules", "test", "docs", "examples"],
      "metadata": {
        "category": "browser-automation",
        "priority": "high",
        "update_frequency": "daily"
      }
    },
    {
      "name": "puppeteer-extra",
      "url": "https://github.com/berstend/puppeteer-extra",
      "branch": "master",
      "description": "A modular plugin framework for Puppeteer",
      "include_patterns": ["*.js", "*.md", "*.json"],
      "exclude_patterns": ["node_modules", "test", "docs"],
      "metadata": {
        "category": "browser-automation",
        "priority": "high",
        "update_frequency": "daily"
      }
    },
    {
      "name": "playwright",
      "url": "https://github.com/microsoft/playwright",
      "branch": "main",
      "description": "Node.js library to automate Chromium, Firefox and WebKit",
      "include_patterns": ["*.js", "*.md", "*.json", "*.ts"],
      "exclude_patterns": ["node_modules", "test", "docs", "examples"],
      "metadata": {
        "category": "browser-automation",
        "priority": "medium",
        "update_frequency": "weekly"
      }
    },
    {
      "name": "selenium-webdriver",
      "url": "https://github.com/SeleniumHQ/selenium",
      "branch": "trunk",
      "description": "A browser automation framework and ecosystem",
      "include_patterns": ["*.js", "*.md", "*.json", "*.py", "*.java"],
      "exclude_patterns": ["node_modules", "test", "docs", "examples", "third_party"],
      "metadata": {
        "category": "browser-automation",
        "priority": "medium",
        "update_frequency": "weekly"
      }
    }
  ],
  "indexing": {
    "schedule": "0 2 * * *",
    "timeout": 3600,
    "retry_attempts": 3,
    "batch_size": 50
  },
  "retrieval": {
    "max_results": 10,
    "similarity_threshold": 0.7,
    "rerank": true
  }
}
```

## Setup Instructions

### 1. Environment Setup
```bash
# Copy environment template
cp .env.rag.example .env.rag

# Edit with your actual API keys and configuration
nano .env.rag
```

### 2. Python Dependencies
```bash
# Create virtual environment
python -m venv rag_env
source rag_env/bin/activate  # On Windows: rag_env\Scripts\activate

# Install dependencies
pip install -r requirements.txt
```

### 3. Initial Setup
```bash
# Run setup script
python scripts/setup_rag.py

# Initialize RAG database
python scripts/update_rag_index.py --init
```

### 4. Start Dashboard
```bash
# Start Streamlit dashboard
streamlit run dashboard/app.py
```

### 5. Test the System
```bash
# Run tests
python tests/test_rag_system.py

# Run benchmark
python scripts/benchmark_rag.py
```

## Security Notes
- Keep API keys secure and never commit them to version control
- Use environment variables for sensitive configuration
- Implement proper access controls for the dashboard
- Regularly update dependencies for security patches
- Monitor API usage to prevent abuse

## Troubleshooting
- Check logs in `./logs/rag_system.log` for errors
- Verify API keys are correctly set in environment variables
- Ensure ChromaDB has proper write permissions
- Check network connectivity for external repositories
- Monitor system resources during indexing operations