# RAG System Python Requirements

## Core Dependencies

### RAG and Vector Database
```txt
chromadb==0.4.22
sentence-transformers==2.2.2
langchain==0.1.0
langchain-community==0.1.0
langchain-chroma==0.1.0
```

### AI Model Integration
```txt
openai==1.10.0
anthropic==0.18.1
requests==2.31.0
httpx==0.26.0
```

### Repository Analysis
```txt
GitPython==3.1.41
tree-sitter==0.20.4
tree-sitter-javascript==0.20.2
tree-sitter-python==0.20.4
tree-sitter-typescript==0.20.2
PyGithub==2.1.1
```

### Web Framework and API
```txt
fastapi==0.109.0
uvicorn==0.27.0
pydantic==2.5.3
python-multipart==0.0.6
```

### Dashboard and Visualization
```txt
streamlit==1.30.0
plotly==5.17.0
pandas==2.1.4
numpy==1.26.3
matplotlib==3.8.2
seaborn==0.13.1
```

### Configuration and Utilities
```txt
PyYAML==6.0.1
python-dotenv==1.0.0
click==8.1.7
tqdm==4.66.1
colorama==0.4.6
```

### Logging and Monitoring
```txt
loguru==0.7.2
prometheus-client==0.19.0
psutil==5.9.8
```

### Development and Testing
```txt
pytest==7.4.4
pytest-asyncio==0.23.3
pytest-cov==4.1.0
black==23.12.1
flake8==7.0.0
mypy==1.8.0
```

### Additional Utilities
```txt
aiofiles==23.2.1
asyncio==3.4.3
aiohttp==3.9.1
beautifulsoup4==4.12.2
lxml==5.1.0
python-dateutil==2.8.2
```

## Complete requirements.txt

```txt
# RAG and Vector Database
chromadb==0.4.22
sentence-transformers==2.2.2
langchain==0.1.0
langchain-community==0.1.0
langchain-chroma==0.1.0

# AI Model Integration
openai==1.10.0
anthropic==0.18.1
requests==2.31.0
httpx==0.26.0

# Repository Analysis
GitPython==3.1.41
tree-sitter==0.20.4
tree-sitter-javascript==0.20.2
tree-sitter-python==0.20.4
tree-sitter-typescript==0.20.2
PyGithub==2.1.1

# Web Framework and API
fastapi==0.109.0
uvicorn==0.27.0
pydantic==2.5.3
python-multipart==0.0.6

# Dashboard and Visualization
streamlit==1.30.0
plotly==5.17.0
pandas==2.1.4
numpy==1.26.3
matplotlib==3.8.2
seaborn==0.13.1

# Configuration and Utilities
PyYAML==6.0.1
python-dotenv==1.0.0
click==8.1.7
tqdm==4.66.1
colorama==0.4.6

# Logging and Monitoring
loguru==0.7.2
prometheus-client==0.19.0
psutil==5.9.8

# Development and Testing
pytest==7.4.4
pytest-asyncio==0.23.3
pytest-cov==4.1.0
black==23.12.1
flake8==7.0.0
mypy==1.8.0

# Additional Utilities
aiofiles==23.2.1
asyncio==3.4.3
aiohttp==3.9.1
beautifulsoup4==4.12.2
lxml==5.1.0
python-dateutil==2.8.2
```

## Installation Instructions

### 1. Create Virtual Environment
```bash
# Create virtual environment
python -m venv rag_env

# Activate virtual environment
# On Windows:
rag_env\Scripts\activate
# On macOS/Linux:
source rag_env/bin/activate
```

### 2. Install Dependencies
```bash
# Upgrade pip
pip install --upgrade pip

# Install requirements
pip install -r requirements.txt

# For development (optional)
pip install -r requirements-dev.txt
```

### 3. Verify Installation
```bash
# Test imports
python -c "import chromadb, openai, anthropic, streamlit; print('All packages imported successfully')"

# Check versions
pip list | grep -E "(chromadb|openai|anthropic|streamlit|fastapi|langchain)"
```

## Alternative Installation Methods

### Using pip-tools
```bash
# Install pip-tools
pip install pip-tools

# Compile requirements
pip-compile requirements.in

# Install compiled requirements
pip-sync
```

### Using Poetry
```toml
[tool.poetry]
name = "gmailcreator-rag"
version = "1.0.0"
description = "RAG system for GmailCreator"

[tool.poetry.dependencies]
python = "^3.8"
chromadb = "^0.4.22"
sentence-transformers = "^2.2.2"
langchain = "^0.1.0"
openai = "^1.10.0"
anthropic = "^0.18.1"
streamlit = "^1.30.0"
fastapi = "^0.109.0"
uvicorn = "^0.27.0"
```

### Using Conda
```yaml
name: gmailcreator-rag
channels:
  - conda-forge
  - defaults
dependencies:
  - python=3.9
  - pip
  - pip:
    - chromadb==0.4.22
    - sentence-transformers==2.2.2
    - langchain==0.1.0
    - openai==1.10.0
    - anthropic==0.18.1
    - streamlit==1.30.0
    - fastapi==0.109.0
    - uvicorn==0.27.0
```

## Version Compatibility

### Python Versions
- **Recommended**: Python 3.9+
- **Minimum**: Python 3.8
- **Tested**: Python 3.8, 3.9, 3.10, 3.11

### Operating Systems
- **Windows**: 10, 11
- **macOS**: 10.15+
- **Linux**: Ubuntu 18.04+, CentOS 7+, Debian 9+

### Hardware Requirements
- **RAM**: Minimum 4GB, Recommended 8GB+
- **Storage**: Minimum 2GB free space
- **CPU**: Multi-core processor recommended
- **GPU**: Optional, for faster embeddings

## Troubleshooting

### Common Issues

#### 1. ChromaDB Installation
```bash
# If chromadb installation fails
pip install --upgrade pip setuptools wheel
pip install chromadb==0.4.22 --no-cache-dir
```

#### 2. Sentence Transformers
```bash
# If sentence-transformers fails
pip install torch torchvision torchaudio --index-url https://download.pytorch.org/whl/cpu
pip install sentence-transformers==2.2.2
```

#### 3. Tree-sitter
```bash
# If tree-sitter fails
pip install cython
pip install tree-sitter==0.20.4
```

#### 4. Streamlit on Windows
```bash
# If streamlit has issues on Windows
pip install protobuf==3.20.3
pip install streamlit==1.30.0
```

### Performance Optimization

#### 1. Use CPU-optimized PyTorch
```bash
pip install torch torchvision torchaudio --index-url https://download.pytorch.org/whl/cpu
```

#### 2. Install specific versions for compatibility
```bash
pip install numpy==1.26.3 pandas==2.1.4
```

#### 3. Use conda for complex dependencies
```bash
conda install -c conda-forge chromadb sentence-transformers
```

## Security Considerations

- Keep all API keys secure and use environment variables
- Regularly update dependencies for security patches
- Use virtual environments to isolate dependencies
- Monitor for known vulnerabilities in dependencies
- Implement proper access controls for the dashboard

## Maintenance

### Regular Updates
```bash
# Check for outdated packages
pip list --outdated

# Update specific packages
pip install --upgrade package_name

# Update all packages (use with caution)
pip install --upgrade -r requirements.txt
```

### Dependency Management
```bash
# Generate requirements from current environment
pip freeze > requirements.txt

# Check for conflicts
pip check