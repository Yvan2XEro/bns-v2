import type { Payload, TaskConfig } from "payload";
import { enforceOverdue } from "../services/commission";

/**
 * Daily sweep over unpaid commission invoices. Every age threshold — the
 * dueAt−2d reminder, the move to `overdue`, the shop restriction after
 * `restrictAfterOverdueDays` and the 30-day staff report — lives in
 * `enforceOverdue`; this job only supplies the clock.
 *
 * It runs an hour after `issueCommissionInvoices` on the same queue, so a
 * Monday's fresh invoices are already in place before the day's ages are
 * recomputed.
 *
 * The restriction reaches search through the shops collection: `enforceOverdue`
 * writes `ordersRestrictedAt` with `payload.update`, and `Shops.afterChange`
 * publishes `shop.updated` with `reindexListings` because that field is one of
 * `LISTING_VISIBLE_FIELDS`. The job must not publish it a second time.
 */
export async function enforceCommissionOverdue(
	payload: Payload,
	now: Date = new Date(),
): Promise<{ marked: string[]; restricted: string[]; reported: string[] }> {
	return await enforceOverdue(payload, now);
}

export const enforceCommissionOverdueTask: TaskConfig<"enforceCommissionOverdue"> =
	{
		slug: "enforceCommissionOverdue",
		retries: 1,
		inputSchema: [],
		schedule: [{ cron: "0 6 * * *", queue: "commission" }],
		handler: async ({ req }) => ({
			output: await enforceCommissionOverdue(req.payload),
		}),
	};
