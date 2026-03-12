# ── Stage 1: build ───────────────────────────────────────────────────────────
FROM node:20-alpine AS builder

WORKDIR /app

# Copy manifests first so Docker cache is reused when only source changes
COPY package*.json tsconfig.json ./
RUN npm ci --ignore-scripts

# Copy source and compile
COPY src/ ./src/
RUN npm run build

# Prune dev dependencies so we copy only what's needed to run
RUN npm prune --omit=dev

# ── Stage 2: runtime ─────────────────────────────────────────────────────────
FROM node:20-alpine AS runtime

WORKDIR /app

# Copy compiled JS and production node_modules from the builder stage
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./package.json

# Non-root user for security
RUN addgroup -S mcp && adduser -S mcp -G mcp
USER mcp

# Transport and port configuration
ENV MCP_TRANSPORT=http
ENV PORT=9000

EXPOSE 9000

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -qO- http://localhost:9000/health || exit 1

CMD ["node", "dist/index.js"]
