import type { Payload } from "payload";
import { type CounterStore, getCounterStore } from "../lib/rateLimit";
import { withTransaction } from "../lib/transactions";
import { isUniqueViolation } from "./shops";

function dateFromBucket(bucket: string): string {
	if (!/^\d{8}$/.test(bucket))
		throw new Error("Invalid listing view date bucket.");
	return `${bucket.slice(0, 4)}-${bucket.slice(4, 6)}-${bucket.slice(6, 8)}`;
}

export async function flushListingViewHash(
	payload: Payload,
	bucket: string,
	options: { store?: CounterStore } = {},
): Promise<{ processed: number; applied: number }> {
	const store = options.store ?? getCounterStore();
	if (!store.getHash)
		throw new Error("The counter store does not support getHash().");
	const entries = await store.getHash(`stats:views:${bucket}`);
	const date = dateFromBucket(bucket);
	let applied = 0;
	for (const [listingId, rawCount] of Object.entries(entries)) {
		const count = Number(rawCount);
		if (!Number.isSafeInteger(count) || count < 1) continue;
		try {
			const didApply = await withTransaction(payload, async (req) => {
				const existing = await payload.find({
					collection: "listing-view-flushes",
					where: {
						and: [
							{ listing: { equals: listingId } },
							{ date: { equals: date } },
						],
					},
					limit: 1,
					depth: 0,
					overrideAccess: true,
					req,
				});
				if (existing.docs.length > 0) return false;
				const listings = await payload.find({
					collection: "listings",
					where: { id: { equals: listingId } },
					limit: 1,
					depth: 0,
					overrideAccess: true,
					req,
				});
				const listing = listings.docs[0];
				if (!listing) return false;
				await payload.create({
					collection: "listing-view-flushes",
					depth: 0,
					overrideAccess: true,
					req,
					data: {
						listing: listingId,
						date,
						views: count,
						purgeAt: new Date(
							Date.parse(`${date}T00:00:00.000Z`) + 10 * 86_400_000,
						).toISOString(),
					},
				});
				await payload.update({
					collection: "listings",
					id: listingId,
					depth: 0,
					overrideAccess: true,
					context: { statsService: true },
					req,
					data: { views: Number(listing.views ?? 0) + count },
				});
				return true;
			});
			if (didApply) applied++;
		} catch (error) {
			if (isUniqueViolation(error)) continue;
			throw error;
		}
	}
	return { processed: Object.keys(entries).length, applied };
}
