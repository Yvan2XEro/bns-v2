FROM node:22-alpine AS base
RUN apk add --no-cache libc6-compat
RUN npm install -g bun

# --- Dependencies ---
FROM base AS deps
WORKDIR /app
COPY bun.lock package.json ./
COPY packages/api/package.json ./packages/api/
COPY packages/biome-config/package.json ./packages/biome-config/
RUN cd packages/api && bun install --ci

# --- Builder ---
FROM base AS builder
ARG DATABASE_URL
ARG PAYLOAD_SECRET
ENV DATABASE_URL=$DATABASE_URL
ENV PAYLOAD_SECRET=$PAYLOAD_SECRET
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/packages/api/node_modules ./packages/api/node_modules
COPY package.json ./
COPY packages/api ./packages/api
COPY packages/biome-config ./packages/biome-config

WORKDIR /app/packages/api
ENV NEXT_TELEMETRY_DISABLED=1
ENV TURBOPACK_ROOT=/app
RUN mkdir -p public
RUN bun run build

# --- Runner ---
FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs

# Copy standalone output preserving monorepo structure
COPY --from=builder --chown=nextjs:nodejs /app/packages/api/.next/standalone ./

# Copy public and static assets into the correct nested path
COPY --from=builder /app/packages/api/public ./packages/api/public
RUN mkdir -p packages/api/.next && chown nextjs:nodejs packages/api/.next
COPY --from=builder --chown=nextjs:nodejs /app/packages/api/.next/static ./packages/api/.next/static

USER nextjs
EXPOSE 3000
ENV PORT=3000
WORKDIR /app/packages/api
CMD HOSTNAME="0.0.0.0" node server.js
