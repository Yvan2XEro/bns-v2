import type { Payload, TaskConfig } from "payload";
import { enforceOverdue, type OverdueStage } from "../services/commission";
import { notifyCommissionInvoiceOverdue } from "../services/orders/notifications";

/**
 * Daily sweep over unpaid commission invoices. Every age threshold — the
 * dueAt−2d reminder, the move to `overdue`, the shop restriction after
 * `restrictAfterOverdueDays` and the 30-day staff report — lives in
 * `enforceOverdue`; this job supplies the clock and fires the notifications.
 *
 * It runs an hour after `issueCommissionInvoices` on the same queue, so a
 * Monday's fresh invoices are already in place before the day's ages are
 * recomputed.
 *
 * The restriction reaches search through the shops collection: `enforceOverdue`
 * writes `ordersRestrictedAt` with `payload.update`, and `Shops.afterChange`
 * publishes `shop.updated` with `reindexListings` because that field is one of
 * `LISTING_VISIBLE_FIELDS`. The job must not publish it a second time.
 *
 * The notifications run after `enforceOverdue` has finished all of its writes,
 * never between them: a seller must not be told their shop is restricted by a
 * sweep that then fails before writing the restriction. Each stage is already
 * idempotent at the write — the reminder has `dueSoonReminderSentAt`, the mark
 * only fires on `issued`, the restriction only on a shop not yet restricted —
 * so a replayed sweep returns an empty `notify` and sends nothing.
 */
export async function enforceCommissionOverdue(
	payload: Payload,
	now: Date = new Date(),
): Promise<{
	marked: string[];
	notified: Array<{ invoiceId: string; stage: OverdueStage }>;
	reported: string[];
	restricted: string[];
}> {
	const { marked, notify, reported, restricted } = await enforceOverdue(
		payload,
		now,
	);

	const notified: Array<{ invoiceId: string; stage: OverdueStage }> = [];
	for (const { invoice, stage } of notify) {
		await notifyCommissionInvoiceOverdue(payload, invoice, stage);
		notified.push({ invoiceId: String(invoice.id), stage });
	}

	return { marked, notified, reported, restricted };
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
