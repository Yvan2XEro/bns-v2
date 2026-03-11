FROM node:22-alpine AS base
RUN apk add --no-cache libc6-compat
RUN npm install -g bun

# --- Dependencies ---
FROM base AS deps
WORKDIR /app
COPY bun.lock package.json ./
COPY packages/web/package.json ./packages/web/
COPY packages/chat-client-sdk/package.json ./packages/chat-client-sdk/
COPY packages/biome-config/package.json ./packages/biome-config/
RUN cd packages/web && bun install --ci

# --- Builder ---
FROM base AS builder
WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY packages/chat-client-sdk ./packages/chat-client-sdk
COPY packages/biome-config ./packages/biome-config
COPY packages/web ./packages/web
COPY --from=deps /app/packages/web/node_modules ./packages/web/node_modules
COPY --from=deps /app/packages/chat-client-sdk/node_modules ./packages/chat-client-sdk/node_modules

WORKDIR /app/packages/web
ENV NEXT_TELEMETRY_DISABLED=1
ENV TURBOPACK_ROOT=/app
RUN bun run build

# --- Runner ---
FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs

COPY --from=builder /app/packages/web/public ./packages/web/public
RUN mkdir -p packages/web/.next && chown nextjs:nodejs packages/web/.next

COPY --from=builder --chown=nextjs:nodejs /app/packages/web/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/packages/web/.next/static ./packages/web/.next/static

USER nextjs
EXPOSE 3001
ENV PORT=3001
WORKDIR /app/packages/web
CMD HOSTNAME="0.0.0.0" node server.js
