import type { Payload } from "payload";
import { SHOP_SERVICE_CONTEXT } from "../collections/Shops";
import { onCommit } from "../lib/transactions";

/**
 * Recount rather than increment: idempotent, and self-healing after any
 * missed event. Takes `Payload`, never the caller's `req`: Payload's
 * `createLocalReq` mutates a passed `req` in place, merging `context` into
 * it, so sharing the listing write's `req` here would leave
 * `shopService: true` on that request for every write that follows it —
 * silently skipping the suspension check and the service-field guard the
 * next write to `shops` on that same request relies on.
 */
export async function refreshShopListingCount(
	payload: Payload,
	shopId: string,
): Promise<void> {
	try {
		const { totalDocs } = await payload.count({
			collection: "listings",
			overrideAccess: true,
			where: {
				and: [
					{ shop: { equals: shopId } },
					{ status: { equals: "published" } },
				],
			},
		});
		await payload.update({
			collection: "shops",
			id: shopId,
			overrideAccess: true,
			context: SHOP_SERVICE_CONTEXT,
			data: { publishedListingCount: totalDocs },
		});
	} catch (error) {
		console.error(
			`[shops] failed to recount listings of shop ${shopId}:`,
			error,
		);
	}
}

/**
 * Queues the recount for after the caller's transaction commits, the way
 * `queueSearchEvent` queues its Redis publish: two concurrent publishes on
 * one shop then each count the other's committed write, instead of both
 * counting inside their own transaction and writing the lower number. Runs
 * immediately when `req` carries no transaction this call can join (no
 * transaction at all, or one this process does not own) — same fallback
 * `onCommit` documents for the search event.
 */
export async function queueShopRecount(
	req: { payload: Payload; context?: Record<string, unknown> },
	shopId: string,
): Promise<void> {
	const { payload } = req;
	if (onCommit(req, () => refreshShopListingCount(payload, shopId))) return;
	await refreshShopListingCount(payload, shopId);
}
