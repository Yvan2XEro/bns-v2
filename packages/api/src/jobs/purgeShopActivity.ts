import type { Payload, TaskConfig, Where } from "payload";
import { SHOP_ACTIVITY_CONTEXT } from "../collections/ShopActivityLog";
import { ACTIVITY_PAGE_SIZE } from "../services/shopActivity";

export const SHOP_ACTIVITY_RETENTION_MONTHS = 24;

/** Calendar months, not a fixed day count: "two years of history" is what a seller is told. */
function cutoff(now: Date): string {
	const at = new Date(now.getTime());
	at.setUTCMonth(at.getUTCMonth() - SHOP_ACTIVITY_RETENTION_MONTHS);
	return at.toISOString();
}

/**
 * Pages through stale rows `ACTIVITY_PAGE_SIZE` at a time rather than loading
 * the whole collection, and never re-queries a row this run already tried
 * and failed on: `skipped` excludes it via `not_in`, so a bad row (a
 * dangling reference, a transient store error) is logged once and left for
 * the next run - every other stale row still gets deleted today. A deleted
 * row simply disappears from the next page's match, so the loop makes
 * guaranteed progress each pass and terminates once nothing matching is left
 * to attempt.
 *
 * Deleting an entry is never itself recorded here: `shop-activity-log` has
 * no `afterDelete` hook and this job never calls `recordShopActivity`, so
 * ageing the log out never writes it back into growth.
 */
export async function purgeShopActivity(
	payload: Payload,
	now: Date = new Date(),
): Promise<{ deleted: number }> {
	const before = cutoff(now);
	const skipped = new Set<string>();
	let deleted = 0;

	for (;;) {
		const and: Where[] = [{ createdAt: { less_than: before } }];
		if (skipped.size > 0) and.push({ id: { not_in: [...skipped] } });

		const page = await payload.find({
			collection: "shop-activity-log",
			where: { and },
			sort: "createdAt",
			depth: 0,
			limit: ACTIVITY_PAGE_SIZE,
			overrideAccess: true,
		});
		if (page.docs.length === 0) break;

		for (const entry of page.docs) {
			const id = String(entry.id);
			try {
				await payload.delete({
					collection: "shop-activity-log",
					id,
					overrideAccess: true,
					context: SHOP_ACTIVITY_CONTEXT,
				});
				deleted += 1;
			} catch (error) {
				payload.logger.error(
					{ err: error, id },
					"[shop-activity] purge failed for one row; continuing with the rest",
				);
				skipped.add(id);
			}
		}

		if (page.docs.length < ACTIVITY_PAGE_SIZE) break;
	}

	return { deleted };
}

/**
 * Monthly rather than nightly: the log is append-only and bounded by member
 * activity, so a month of drift costs nothing, and a nightly scan of a
 * collection whose oldest row is normally well inside the window is pure
 * load for no benefit.
 */
export const purgeShopActivityTask: TaskConfig<"purgeShopActivity"> = {
	slug: "purgeShopActivity",
	retries: 1,
	inputSchema: [],
	schedule: [{ cron: "0 4 1 * *", queue: "nightly" }],
	handler: async ({ req }) => {
		const result = await purgeShopActivity(req.payload);
		return { output: result };
	},
};
