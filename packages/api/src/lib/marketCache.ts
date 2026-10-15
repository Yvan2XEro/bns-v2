import type { Payload } from "payload";

export const MARKET_CACHE_TTL_MS = 60_000;

interface Entry<T> {
	at: number;
	value: T;
}

// Keyed by instance so two Payload clients (or two tests) never share a list.
const entries = new WeakMap<Payload, Entry<unknown>>();

export function readMarketCache<T>(payload: Payload): T | undefined {
	const hit = entries.get(payload);
	return hit && Date.now() - hit.at < MARKET_CACHE_TTL_MS
		? (hit.value as T)
		: undefined;
}

export function writeMarketCache<T>(payload: Payload, value: T): void {
	entries.set(payload, { at: Date.now(), value });
}

export function invalidateMarketCache(payload: Payload): void {
	entries.delete(payload);
}
