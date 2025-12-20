# Build stage
FROM node:20-alpine AS builder

RUN apk add --no-cache libc6-compat
RUN corepack enable && corepack prepare pnpm@8 --activate

WORKDIR /app

# Copy workspace files
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json turbo.json ./
COPY packages/contracts/package.json packages/contracts/
COPY services/api/package.json services/api/

# Install dependencies
RUN pnpm install --frozen-lockfile

# Copy source files
COPY packages/contracts packages/contracts
COPY services/api services/api

# Generate Prisma client
RUN pnpm --filter api prisma generate

# Build
RUN pnpm turbo run build --filter=api

# Prune dev dependencies
RUN pnpm prune --prod

# Production stage
FROM node:20-alpine AS runner

RUN apk add --no-cache libc6-compat dumb-init

WORKDIR /app

# Create non-root user
RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 budi

# Copy built application
COPY --from=builder --chown=budi:nodejs /app/node_modules ./node_modules
COPY --from=builder --chown=budi:nodejs /app/packages/contracts/dist ./packages/contracts/dist
COPY --from=builder --chown=budi:nodejs /app/packages/contracts/package.json ./packages/contracts/
COPY --from=builder --chown=budi:nodejs /app/services/api/dist ./services/api/dist
COPY --from=builder --chown=budi:nodejs /app/services/api/package.json ./services/api/
COPY --from=builder --chown=budi:nodejs /app/services/api/prisma ./services/api/prisma
COPY --from=builder --chown=budi:nodejs /app/services/api/node_modules ./services/api/node_modules

USER budi

WORKDIR /app/services/api

ENV NODE_ENV=production
ENV HOST=0.0.0.0
ENV PORT=3000

EXPOSE 3000

# Use dumb-init to handle PID 1 properly
ENTRYPOINT ["dumb-init", "--"]
CMD ["node", "dist/index.js"]
