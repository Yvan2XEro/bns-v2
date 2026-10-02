/**
 * Stands in for Bun's built-in `RedisClient`, imported from the bare
 * specifier `"bun"` by `chat-service/src/redis.ts`. Vite's resolver — unlike
 * Node's or Bun's own loader — does not recognise `"bun"` as a built-in, so
 * loading that module under vitest 404s looking for a package of that name
 * in `node_modules`.
 *
 * `chat-channel-parity.int.spec.ts` (Task 15) is the first spec to import a
 * `chat-service` module at all, pulling `redis.ts` in transitively through
 * `membership.ts`/`cache.ts`/`systemMessages.ts` even though it only reads
 * two exported string constants and never calls `getRedis()`. This shim
 * only has to satisfy that import, not behave like a real Redis client —
 * nothing in this suite constructs one.
 */
export class RedisClient {}
