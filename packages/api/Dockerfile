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
RUN mkdir -p public
RUN bun run build

# Normalize standalone output: handle both flat and monorepo structures
RUN if [ -f .next/standalone/server.js ]; then \
      mkdir -p /standalone && cp -r .next/standalone/* /standalone/; \
    elif [ -f .next/standalone/packages/api/server.js ]; then \
      mkdir -p /standalone && \
      cp -r .next/standalone/node_modules /standalone/ 2>/dev/null || true && \
      cp -r .next/standalone/packages/api/* /standalone/; \
    fi

# --- Runner ---
FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs

COPY --from=builder /app/packages/api/public ./public
RUN mkdir .next && chown nextjs:nodejs .next

COPY --from=builder --chown=nextjs:nodejs /standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/packages/api/.next/static ./.next/static

USER nextjs
EXPOSE 3000
ENV PORT=3000
CMD HOSTNAME="0.0.0.0" node server.js
