import AsyncStorage from "@react-native-async-storage/async-storage";
import {
	type DehydratedState,
	dehydrate,
	hydrate,
	type QueryClient,
	type QueryKey,
} from "@tanstack/react-query";

/**
 * What the app showed last time, kept on the phone: reopened offline, the
 * home feed, favourites, purchases, conversations, cart and a seller's orders
 * are there instead of an empty screen, and refresh once the network is back.
 */
const STORAGE_KEY = "bns.queryCache.v1";
/** Older than this, the snapshot misleads more than it helps. */
export const PERSIST_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;
/** A snapshot bigger than this is skipped rather than slowing every start. */
const MAX_BYTES = 2_000_000;
const WRITE_THROTTLE_MS = 2_000;

const PERSISTED_ROOTS = new Set([
	"app-config",
	"cart",
	"categories",
	"conversations",
	"favorites",
	"listing",
	"listings",
	"messages",
	"my-listings",
	"purchases",
	"shops",
]);

export function shouldPersistQuery(key: QueryKey): boolean {
	const root = key[0];
	return typeof root === "string" && PERSISTED_ROOTS.has(root);
}

interface Snapshot {
	userId: string | null;
	savedAt: number;
	state: DehydratedState;
}

/** A snapshot is only ever restored for the account that wrote it, while fresh. */
export function isRestorable(
	snapshot: Snapshot | null,
	userId: string | null,
	now = Date.now(),
): snapshot is Snapshot {
	return (
		snapshot !== null &&
		snapshot.userId === userId &&
		now - snapshot.savedAt < PERSIST_MAX_AGE_MS
	);
}

export async function restoreQueryCache(
	client: QueryClient,
	userId: string | null,
): Promise<void> {
	try {
		const raw = await AsyncStorage.getItem(STORAGE_KEY);
		const snapshot = raw ? (JSON.parse(raw) as Snapshot) : null;
		// Only ever older than what a screen may already have fetched: hydrate
		// keeps the newer of the two.
		if (isRestorable(snapshot, userId)) hydrate(client, snapshot.state);
		else if (raw) await AsyncStorage.removeItem(STORAGE_KEY);
	} catch {
		// A corrupt snapshot costs a cold start, nothing more.
	}
}

/** Writes the snapshot as the cache changes; returns the unsubscribe. */
export function persistQueryCache(
	client: QueryClient,
	userId: string | null,
): () => void {
	let timer: ReturnType<typeof setTimeout> | null = null;
	const write = () => {
		timer = null;
		try {
			const state = dehydrate(client, {
				shouldDehydrateQuery: (query) =>
					query.state.status === "success" &&
					shouldPersistQuery(query.queryKey),
			});
			const json = JSON.stringify({ userId, savedAt: Date.now(), state });
			if (json.length > MAX_BYTES) return;
			void AsyncStorage.setItem(STORAGE_KEY, json).catch(() => undefined);
		} catch {
			// Something unserialisable in the cache: skip this round.
		}
	};
	const unsubscribe = client.getQueryCache().subscribe((event) => {
		if (event.type !== "updated" || timer) return;
		timer = setTimeout(write, WRITE_THROTTLE_MS);
	});
	return () => {
		unsubscribe();
		if (timer) clearTimeout(timer);
	};
}
