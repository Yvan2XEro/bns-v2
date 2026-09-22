import type { Payload } from "payload";
import { getProvider as defaultGetProvider } from "../lib/payments";
import type { PaymentProvider, ProviderName } from "../lib/payments/types";
import { applyStatus } from "./payments";

export const RECONCILE_AFTER_MS = 10 * 60 * 1000;

/** Covers a missed webhook and a buyer who closed the browser before the callback. */
export async function reconcilePendingPayments(
	payload: Payload,
	{
		now = new Date(),
		getProvider = defaultGetProvider,
		limit = 100,
	}: {
		now?: Date;
		getProvider?: (name: ProviderName) => PaymentProvider;
		limit?: number;
	} = {},
): Promise<{
	checked: number;
	settled: number;
	expired: number;
	errors: number;
}> {
	const stats = { checked: 0, settled: 0, expired: 0, errors: 0 };
	const { docs } = await payload.find({
		collection: "payment-intents",
		where: {
			and: [
				{ status: { in: ["created", "pending"] } },
				{
					createdAt: {
						less_than: new Date(
							now.getTime() - RECONCILE_AFTER_MS,
						).toISOString(),
					},
				},
			],
		},
		sort: "createdAt",
		limit,
		depth: 0,
		overrideAccess: true,
	});

	for (const intent of docs) {
		stats.checked += 1;
		const intentId = String(intent.id);
		try {
			if (intent.providerReference) {
				const verified = await getProvider(intent.provider).verifyPayment(
					intent.providerReference,
				);
				if (verified.status !== "pending") {
					const result = await applyStatus(payload, intentId, {
						status: verified.status,
						source: "reconcile",
						at: now,
						amount: verified.amount,
						currency: verified.currency,
					});
					if (result.outcome === "applied") {
						stats.settled += 1;
						continue;
					}
					if (result.outcome === "amount_mismatch") continue;
				}
			}

			if (
				intent.expiresAt &&
				new Date(intent.expiresAt).getTime() <= now.getTime()
			) {
				const result = await applyStatus(payload, intentId, {
					status: "expired",
					source: "reconcile",
					at: now,
				});
				if (result.outcome === "applied") stats.expired += 1;
			}
		} catch (error) {
			stats.errors += 1;
			payload.logger.error({
				msg: "[payments] reconciliation failed for an intent",
				intentId,
				err: error,
			});
		}
	}

	return stats;
}
