FROM node:20 AS base

# Install dependencies for OpenCV, canvas and sharp
RUN apt-get update && apt-get install -y \
    cmake \
    build-essential \
    libopencv-dev \
    python3 \
    make \
    g++ \
    libcairo2-dev \
    libjpeg-dev \
    libpango1.0-dev \
    libgif-dev \
    librsvg2-dev \
    libvips-dev \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm ci --only=production

# Development stage
FROM base AS dev

# Install dev dependencies
RUN npm ci

# Copy source code
COPY . .

# Create directories
RUN mkdir -p uploads logs temp

EXPOSE 3000

CMD ["npm", "run", "dev"]

# Production build stage
FROM base AS builder

# Install dev dependencies for building
RUN npm ci

# Copy source code
COPY . .

# Build TypeScript
RUN npm run build

# Production stage
FROM node:20 AS production

# Install runtime dependencies for OpenCV
RUN apt-get update && apt-get install -y \
    libopencv-dev \
    libcairo2 \
    libjpeg62 \
    libpango1.0 \
    libgif7 \
    librsvg2-2 \
    libvips42 \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install production dependencies only
RUN npm ci --only=production

# Copy built application from builder
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/uploads ./uploads
COPY --from=builder /app/logs ./logs

# Create necessary directories
RUN mkdir -p uploads logs temp && \
    chown -R node:node /app

USER node

EXPOSE 3000

CMD ["node", "dist/server.js"]