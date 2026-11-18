import { createClient } from "redis";

export interface DeliveryEstimateCache {
	get(key: string): Promise<string | null>;
	set(key: string, value: string, ttlSeconds: number): Promise<void>;
}

let current: { url: string; cache: DeliveryEstimateCache } | undefined;

export function getDeliveryEstimateCache(): DeliveryEstimateCache | undefined {
	const url = process.env.REDIS_URL;
	if (!url) return undefined;
	if (current?.url === url) return current.cache;
	const client = createClient({
		url,
		socket: { connectTimeout: 1000, reconnectStrategy: false },
	});
	client.on("error", (error) =>
		console.error("[delivery-estimates] Redis error", error),
	);
	let connecting: Promise<unknown> | undefined;
	async function ready() {
		if (client.isReady) return;
		connecting ??= client.connect().finally(() => {
			connecting = undefined;
		});
		await connecting;
	}
	const cache: DeliveryEstimateCache = {
		async get(key) {
			await ready();
			return client.get(key);
		},
		async set(key, value, ttlSeconds) {
			await ready();
			await client.set(key, value, { EX: ttlSeconds });
		},
	};
	current = { url, cache };
	return cache;
}
