# syntax=docker/dockerfile:1
FROM node:18-slim

# Install OS dependencies required by Chromium/Puppeteer
RUN apt-get update && apt-get install -y --no-install-recommends \
    ca-certificates \
    fonts-liberation \
    libasound2 \
    libatk-bridge2.0-0 \
    libatk1.0-0 \
    libcairo2 \
    libdrm2 \
    libgbm1 \
    libgtk-3-0 \
    libnss3 \
    libxcomposite1 \
    libxdamage1 \
    libxext6 \
    libxfixes3 \
    libxkbcommon0 \
    libxrandr2 \
    libxshmfence1 \
    wget \
    gnupg \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /usr/src/app

# Install production dependencies; allow Puppeteer to download Chromium
COPY package*.json ./
ENV NODE_ENV=production
ENV PUPPETEER_SKIP_DOWNLOAD=false
ENV PUPPETEER_CACHE_DIR=/usr/src/app/.cache/puppeteer
RUN npm ci --omit=dev

# Copy source
COPY . .

# Ensure runtime directories exist (Node also ensures these at startup)
RUN mkdir -p logs temp temp/profiles temp/screenshots

# Run as non-root
RUN useradd -m -u 1001 nodeuser && chown -R nodeuser:nodeuser /usr/src/app
USER nodeuser

# Cloud Run Job executes this entry by default; flags are handled in code [src/stealth-browser.js](src/stealth-browser.js)
CMD ["node", "src/main.js"]