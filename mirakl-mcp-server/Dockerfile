# Multi-stage build
FROM node:22-slim AS builder

WORKDIR /app

# Copy package files
COPY package*.json ./
COPY tsconfig.json ./

# Install dependencies
RUN npm ci

# Copy source
COPY src ./src

# Build
RUN npm run build

# Runtime stage
FROM node:22-slim

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install production dependencies only
RUN npm ci --only=production

# Copy built files from builder
COPY --from=builder /app/dist ./dist

# Copy .env (or mount it at runtime)
# COPY .env .

EXPOSE 3004

CMD ["node", "dist/index.js"]
