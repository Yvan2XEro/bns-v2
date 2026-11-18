import type { Payload, TaskConfig } from "payload";
import { NOT_ARCHIVED } from "../collections/ProductVariants";
import { availableOf } from "../lib/variants";

const PAGE_SIZE = 200;

export interface StockDrift {
	variantId: string;
	productId: string | null;
	sku: string | null;
	/** What `product-variants.stockOnHand` says right now. */
	cached: number;
	/** `stockAfter` of the newest movement: what the ledger says. */
	ledger: number;
	delta: number;
	/** What a buyer currently sees, from the cached counters. */
	available: number;
	/** The newest movement, so a human has somewhere to start reading. */
	movementId: string;
}

const numberOf = (value: unknown): number => Number(value ?? 0);

const idOf = (value: unknown): string | null => {
	if (typeof value === "string") return value;
	if (value && typeof value === "object" && "id" in value) {
		return String((value as { id: unknown }).id);
	}
	return null;
};

/**
 * Compares every live tracked variant's cached `stockOnHand` against the
 * `stock-movements` ledger and reports what disagrees.
 *
 * The ledger is the authority: each movement records the `stockAfter` it
 * produced, so the newest movement's `stockAfter` is what the cache ought to
 * read, and the one before it is the value the cache ought to have held a
 * moment earlier. That second checkpoint is the whole rule. A cache sitting
 * exactly on the previous checkpoint is one movement behind — the ledger
 * names which movement was written but never applied — so the correction is
 * justified by the ledger itself and is safe to make.
 *
 * Any other disagreement is *not* corrected. A figure that matches no
 * checkpoint the ledger ever recorded cannot be explained by a missed write,
 * and quietly overwriting it would destroy the only evidence of whatever
 * produced it — a double-applied sale, a hand edit, a lost transaction. Those
 * are logged at error level and left exactly as they are, for a human.
 *
 * No movement is ever written here. A corrected cache is not a stock change,
 * it is the application of a movement that already exists, and
 * `services/stock.ts` stays the only writer of the ledger.
 */
export async function reconcileStockCaches(payload: Payload): Promise<{
	checked: number;
	corrected: StockDrift[];
	unexplained: StockDrift[];
}> {
	const corrected: StockDrift[] = [];
	const unexplained: StockDrift[] = [];
	let checked = 0;
	let page = 1;

	for (;;) {
		const variants = await payload.find({
			collection: "product-variants",
			where: { and: [{ trackInventory: { equals: true } }, NOT_ARCHIVED] },
			sort: "id",
			limit: PAGE_SIZE,
			page,
			depth: 0,
			overrideAccess: true,
		});

		for (const variant of variants.docs) {
			checked += 1;
			const variantId = String(variant.id);

			const movements = await payload.find({
				collection: "stock-movements",
				where: { variant: { equals: variantId } },
				sort: "-createdAt",
				limit: 2,
				depth: 0,
				overrideAccess: true,
			});
			const head = movements.docs[0];
			// Initial stock can be set when the variant is created, with no
			// movement behind it: there is no authority to compare against.
			if (!head) continue;

			const cached = numberOf(variant.stockOnHand);
			const ledger = numberOf(head.stockAfter);
			if (cached === ledger) continue;

			const previous = movements.docs[1];
			const drift: StockDrift = {
				variantId,
				productId: idOf(variant.product),
				sku: variant.sku ?? null,
				cached,
				ledger,
				delta: cached - ledger,
				available: availableOf(variant),
				movementId: String(head.id),
			};

			if (previous && cached === numberOf(previous.stockAfter)) {
				await payload.update({
					collection: "product-variants",
					id: variantId,
					overrideAccess: true,
					data: { stockOnHand: ledger },
				});
				corrected.push(drift);
				payload.logger.warn(
					drift,
					"[stock] cache was one movement behind the ledger; corrected",
				);
				continue;
			}

			unexplained.push(drift);
			payload.logger.error(
				drift,
				"[stock] cached stock matches no ledger checkpoint; left for a human",
			);
		}

		if (!variants.hasNextPage) break;
		page += 1;
	}

	return { checked, corrected, unexplained };
}

export const reconcileStockCachesTask: TaskConfig<"reconcileStockCaches"> = {
	slug: "reconcileStockCaches",
	retries: 0,
	inputSchema: [],
	schedule: [{ cron: "0 2 * * *", queue: "nightly" }],
	handler: async ({ req }) => ({
		output: await reconcileStockCaches(req.payload),
	}),
};
