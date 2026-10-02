import type { Payload, TaskConfig, Where } from "payload";

export const CART_ABANDON_DAYS = 30;

const DAY_MS = 24 * 60 * 60 * 1000;
const PAGE_SIZE = 500;

/**
 * Ages idle carts out of `active`. Only `active` rows are candidates: a
 * `converted` cart is the record of a purchase and an already-`abandoned`
 * one must not be rewritten on every nightly pass, which would churn
 * `updatedAt` on rows nothing is doing anything with.
 *
 * Nothing is deleted. The cart keeps its lines, so a buyer coming back after
 * a month still sees what they had — `services/cart.ts` revalidates every
 * line's price, stock and shop membership at read time, so a stale cart
 * cannot resurrect a stale price.
 *
 * Paged, and never re-queries a row this run already failed on (`skipped`),
 * so one bad row is logged once and every other idle cart still ages out
 * today. Each pass therefore makes guaranteed progress and terminates.
 */
export async function abandonCarts(
	payload: Payload,
	now: Date = new Date(),
): Promise<{ abandoned: number }> {
	const cutoff = new Date(
		now.getTime() - CART_ABANDON_DAYS * DAY_MS,
	).toISOString();
	const skipped = new Set<string>();
	let abandoned = 0;

	for (;;) {
		const and: Where[] = [
			{ status: { equals: "active" } },
			{
				or: [
					{ lastActivityAt: { less_than_equal: cutoff } },
					// A row written before `lastActivityAt` existed would otherwise
					// never age out at all.
					{
						and: [
							{ lastActivityAt: { exists: false } },
							{ createdAt: { less_than_equal: cutoff } },
						],
					},
				],
			},
		];
		if (skipped.size > 0) and.push({ id: { not_in: [...skipped] } });

		const page = await payload.find({
			collection: "carts",
			where: { and },
			sort: "lastActivityAt",
			limit: PAGE_SIZE,
			depth: 0,
			overrideAccess: true,
		});
		if (page.docs.length === 0) break;

		for (const cart of page.docs) {
			try {
				await payload.update({
					collection: "carts",
					id: cart.id,
					overrideAccess: true,
					data: { status: "abandoned" },
				});
				abandoned += 1;
			} catch (error) {
				payload.logger.error(
					{ err: error, cartId: cart.id },
					"[carts] abandoning one cart failed; continuing with the rest",
				);
				skipped.add(String(cart.id));
			}
		}

		if (page.docs.length < PAGE_SIZE) break;
	}

	return { abandoned };
}

export const abandonCartsTask: TaskConfig<"abandonCarts"> = {
	slug: "abandonCarts",
	retries: 1,
	inputSchema: [],
	outputSchema: [{ name: "abandoned", type: "number" }],
	schedule: [{ cron: "0 3 * * *", queue: "nightly" }],
	handler: async ({ req }) => ({ output: await abandonCarts(req.payload) }),
};
