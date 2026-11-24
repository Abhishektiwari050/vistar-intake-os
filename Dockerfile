# syntax=docker/dockerfile:1

# -----------------------------------------------------------------------------
# Stage 1: Base Alpine image with Node 22, libc6-compat, and corepack pnpm
# -----------------------------------------------------------------------------
FROM node:22-alpine AS base
RUN apk add --no-cache libc6-compat
RUN corepack enable pnpm
WORKDIR /app

# -----------------------------------------------------------------------------
# Stage 2: Install dependencies with frozen lockfile
# -----------------------------------------------------------------------------
FROM base AS deps
WORKDIR /app

# Copy dependency manifests and configuration files
COPY package.json pnpm-lock.yaml .npmrc* pnpm-workspace.yaml* ./

# Install dependencies including devDependencies required for Next.js build
RUN pnpm install --frozen-lockfile

# -----------------------------------------------------------------------------
# Stage 3: Build the application with Next.js standalone output
# -----------------------------------------------------------------------------
FROM base AS builder
WORKDIR /app

# Copy resolved node_modules from deps stage
COPY --from=deps /app/node_modules ./node_modules

# Copy full application source code
COPY . .

# Defensive creation of public folder to prevent COPY failures if empty/absent in git
RUN mkdir -p /app/public

# Build environment variables
ENV NEXT_TELEMETRY_DISABLED=1
ENV NODE_ENV=production

# Execute standalone production build
RUN pnpm run build

# -----------------------------------------------------------------------------
# Stage 4: Minimal production runtime container
# -----------------------------------------------------------------------------
FROM node:22-alpine AS runner
WORKDIR /app

# Install libc6-compat for sharp native musl binary compatibility
RUN apk add --no-cache libc6-compat

# Security hardening: Create non-root system group and user
RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 -G nodejs nextjs

# Production runtime environment
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

# Pre-create data directory for PGlite and cache directory for Next.js
RUN mkdir -p /app/data /app/.next/cache && \
    chown -R nextjs:nodejs /app/data /app/.next

# Copy public directory from builder
COPY --from=builder --chown=nextjs:nodejs /app/public ./public

# Copy Next.js standalone output and static assets
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

# Switch to unprivileged non-root user
USER nextjs

# Expose HTTP port
EXPOSE 3000

# Container healthcheck using Alpine's built-in wget
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://127.0.0.1:3000/api/health || exit 1

# Launch standalone Node.js server
CMD ["node", "server.js"]
