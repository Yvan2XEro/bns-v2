import type { QueryClient } from "@tanstack/react-query";

/** Lists whose rows are full listing documents, the same shape as the detail. */
const LIST_ROOTS = ["listings", "favorites", "my-listings"];

function rowsOf(data: unknown): unknown[] {
	if (!data || typeof data !== "object") return [];
	const value = data as { docs?: unknown; pages?: unknown };
	if (Array.isArray(value.docs)) return value.docs;
	if (Array.isArray(value.pages)) return value.pages.flatMap(rowsOf);
	if (Array.isArray(data)) return data;
	return [];
}

/**
 * The listing as a list already showed it — photo, price, title — so its page
 * opens on that at once instead of a full-screen spinner, and fills in the
 * rest when the detail arrives.
 */
export function findCachedListing<T extends { id: string | number }>(
	client: QueryClient,
	id: string,
): T | undefined {
	for (const root of LIST_ROOTS) {
		for (const [, data] of client.getQueriesData({ queryKey: [root] })) {
			for (const row of rowsOf(data)) {
				const candidate = row as Partial<T> & { listing?: unknown };
				if (candidate && String(candidate.id) === id && "title" in candidate)
					return candidate as T;
				// A favourite row wraps the listing.
				const inner = candidate?.listing as Partial<T> | undefined;
				if (inner && typeof inner === "object" && String(inner.id) === id)
					return inner as T;
			}
		}
	}
	return undefined;
}
