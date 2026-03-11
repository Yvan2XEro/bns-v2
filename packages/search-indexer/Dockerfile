FROM oven/bun:latest AS base

# --- Dependencies ---
FROM base AS deps
WORKDIR /app
COPY packages/search-indexer/package.json ./
COPY bun.lock ./
RUN bun install --ci

# --- Runner ---
FROM base AS runner
WORKDIR /app
ENV NODE_ENV=production

COPY --from=deps /app/node_modules ./node_modules
COPY packages/search-indexer/src ./src
COPY packages/search-indexer/package.json ./

CMD ["bun", "run", "src/index.ts"]
