import type { Payload } from "payload";
import { relationId } from "../lib/relationId";
import type { TxReq } from "../lib/transactions";
import { revealWindowFor } from "./contactReveal";

export interface ContactRevealBackfill {
	backfilled: number;
	removed: number;
}

function toTime(value: unknown, fallback: Date): number {
	if (typeof value === "string" || value instanceof Date) {
		const time = new Date(value).getTime();
		if (!Number.isNaN(time)) return time;
	}
	return fallback.getTime();
}

/**
 * Prepares `contact-reveals` for its unique (viewer, listing, revealWindow)
 * index: rows written before the field existed get one from their own creation
 * timestamp, and rows that still collide afterwards are reduced to the earliest
 * of the group — they are audit rows of a single reveal, so the later ones are
 * duplicates rather than history.
 *
 * Idempotent: a second run finds every row stamped and no group larger than
 * one, and writes nothing.
 */
export async function backfillContactRevealWindows(
	payload: Payload,
	{ now = new Date(), req }: { now?: Date; req?: TxReq } = {},
): Promise<ContactRevealBackfill> {
	const result: ContactRevealBackfill = { backfilled: 0, removed: 0 };
	const groups = new Map<string, { id: string; createdAt: number }[]>();

	let page = 1;
	let hasNextPage = true;
	while (hasNextPage) {
		const batch = await payload.find({
			collection: "contact-reveals",
			depth: 0,
			limit: 500,
			page,
			sort: "createdAt",
			overrideAccess: true,
			req,
		});

		for (const doc of batch.docs) {
			const createdAt = toTime(doc.createdAt, now);
			const stored: unknown = doc.revealWindow;
			const revealWindow =
				typeof stored === "number" && Number.isFinite(stored)
					? stored
					: revealWindowFor(new Date(createdAt));

			if (stored !== revealWindow) {
				await payload.update({
					collection: "contact-reveals",
					id: doc.id,
					data: { revealWindow },
					depth: 0,
					overrideAccess: true,
					req,
				});
				result.backfilled += 1;
			}

			const viewer = relationId(doc.viewer);
			const listing = relationId(doc.listing);
			if (!viewer || !listing) continue;
			const key = `${viewer}:${listing}:${revealWindow}`;
			const group = groups.get(key) ?? [];
			group.push({ id: String(doc.id), createdAt });
			groups.set(key, group);
		}

		hasNextPage = Boolean(batch.hasNextPage);
		page += 1;
	}

	for (const rows of groups.values()) {
		if (rows.length < 2) continue;
		// Oldest wins; the id breaks ties so two runs would pick the same row.
		rows.sort((a, b) => a.createdAt - b.createdAt || a.id.localeCompare(b.id));
		for (const row of rows.slice(1)) {
			await payload.delete({
				collection: "contact-reveals",
				id: row.id,
				depth: 0,
				overrideAccess: true,
				req,
			});
			result.removed += 1;
		}
	}

	return result;
}
