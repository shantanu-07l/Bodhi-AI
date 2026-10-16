# ==============================================================================
# Bodhi AI — JanSahayak Backend Service Dockerfile
# ==============================================================================

FROM node:20-alpine AS base

# Install security updates
RUN apk --no-cache add curl

WORKDIR /app

# Install dependencies
COPY package*.json ./
RUN npm ci --omit=dev && npm cache clean --force

# Copy source code
COPY . .

# Ensure upload directory exists with proper permissions
RUN mkdir -p uploads && chown -R node:node /app

# Run as unprivileged user for security
USER node

EXPOSE 5000

# Health check against dedicated API health endpoint
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD curl -f http://localhost:5000/api/health || exit 1

CMD ["node", "server.js"]
