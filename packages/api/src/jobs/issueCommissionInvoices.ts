import type { Payload, TaskConfig } from "payload";
import {
	issueInvoicesForWeek,
	queueUnreachableCredits,
} from "../services/commission";
import { notifyCommissionInvoiceIssued } from "../services/orders/notifications";

/**
 * Monday morning: invoices the week that has just closed. The week bounds,
 * the netting rule and the per-shop idempotency all belong to
 * `issueInvoicesForWeek` — this job only picks the moment and tells the
 * sellers.
 *
 * `issueInvoicesForWeek` returns `issued`, `netted` and `rolledOver`. Only
 * `issued` is notified: a netted invoice is a `void` row with nothing due and
 * a rolled-over week produced no invoice at all, so there is nothing for a
 * seller to act on in either case.
 *
 * A failed notification never fails the run. The invoice is already
 * committed; losing the push must not make the next run re-attempt an
 * invoicing pass that would then find the week already invoiced and notify
 * nobody.
 */
export async function issueCommissionInvoices(
	payload: Payload,
	now: Date = new Date(),
): Promise<{ issued: string[]; rolledOver: string[]; netted: string[] }> {
	const result = await issueInvoicesForWeek(payload, now);

	for (const invoiceId of result.issued) {
		try {
			const invoice = await payload.findByID({
				collection: "commission-invoices",
				id: invoiceId,
				depth: 0,
				overrideAccess: true,
			});
			await notifyCommissionInvoiceIssued(payload, invoice);
		} catch (error) {
			payload.logger.error(
				{ err: error, invoiceId },
				"[commission] notifying an issued invoice failed; the invoice stands",
			);
		}
	}

	try {
		await queueUnreachableCredits(payload, now);
	} catch (error) {
		payload.logger.error(
			{ err: error },
			"[commission] queueing unreachable credits failed; the next run retries",
		);
	}

	return result;
}

export const issueCommissionInvoicesTask: TaskConfig<"issueCommissionInvoices"> =
	{
		slug: "issueCommissionInvoices",
		retries: 1,
		inputSchema: [],
		schedule: [{ cron: "0 5 * * 1", queue: "commission" }],
		handler: async ({ req }) => ({
			output: await issueCommissionInvoices(req.payload),
		}),
	};
