FROM oven/bun:latest AS base

# --- Dependencies ---
FROM base AS deps
WORKDIR /app
COPY packages/chat-service/package.json ./
COPY bun.lock ./
RUN bun install --ci

# --- Runner ---
FROM base AS runner
WORKDIR /app
ENV NODE_ENV=production

COPY --from=deps /app/node_modules ./node_modules
COPY packages/chat-service/src ./src
COPY packages/chat-service/package.json ./

EXPOSE 4000
ENV PORT=4000
CMD ["bun", "run", "src/server.ts"]
