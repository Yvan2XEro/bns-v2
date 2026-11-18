import type { Payload } from "payload";
import {
	getPaymentSettings,
	type PaymentSettings,
} from "../lib/paymentSettings";
import { getProvider as defaultGetProvider } from "../lib/payments";
import type { MarketplaceProvider } from "../lib/payments/marketplace";
import { getMarketplaceProvider } from "../lib/payments/marketplaceRegistry";
import type { PaymentProvider, ProviderName } from "../lib/payments/types";
import { withTransaction } from "../lib/transactions";
import { applyStatus, settlePayment } from "./payments";
import { applyTransferEvent } from "./payouts";
import { fetchOrNull, refundEventOf, transferEventOf } from "./reconciliation";
import { applyRefundEvent } from "./refunds";

export const RECONCILE_AFTER_MS = 10 * 60 * 1000;
/** A checkout charge is pushed to the payer's phone: two minutes without news is worth a look. */
export const RECONCILE_CHECKOUT_AFTER_MS = 2 * 60 * 1000;
/** Refunds and payouts move in days; one silent for a day has probably lost its webhook. */
export const RECONCILE_MONEY_AFTER_MS = 24 * 60 * 60 * 1000;

export interface PendingStats {
	checked: number;
	settled: number;
	expired: number;
	errors: number;
	refundsApplied: number;
	payoutsApplied: number;
}

export interface ReconcilePendingDeps {
	now?: Date;
	getProvider?: (name: ProviderName) => PaymentProvider;
	limit?: number;
	/** The marketplace port for checkout intents, refunds and payouts; resolved from settings when first needed. */
	marketplace?: MarketplaceProvider;
	settings?: PaymentSettings;
}

/**
 * Covers a missed webhook and a buyer who closed the browser before the
 * callback: P0's intents after 10 minutes, checkout intents (at the
 * marketplace provider) after 2, and refunds and payouts still in flight
 * after 24 hours, each applied through its service with `source: reconcile`.
 */
export async function reconcilePendingPayments(
	payload: Payload,
	deps: ReconcilePendingDeps = {},
): Promise<PendingStats> {
	const {
		now = new Date(),
		getProvider = defaultGetProvider,
		limit = 100,
	} = deps;
	const stats: PendingStats = {
		checked: 0,
		settled: 0,
		expired: 0,
		errors: 0,
		refundsApplied: 0,
		payoutsApplied: 0,
	};
	const { docs } = await payload.find({
		collection: "payment-intents",
		where: {
			and: [
				// Checkout intents live at the marketplace provider, under our reference.
				{ purpose: { not_equals: "checkout" } },
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

	let marketplace = deps.marketplace ?? null;
	const port = async () => {
		marketplace ??= getMarketplaceProvider(
			deps.settings ?? (await getPaymentSettings(payload)),
		);
		return marketplace;
	};
	await reconcileCheckoutIntents(payload, now, limit, port, stats);
	await reconcileStaleRefunds(payload, now, limit, port, stats);
	await reconcileStalePayouts(payload, now, limit, port, stats);
	return stats;
}

type Port = () => Promise<MarketplaceProvider>;

const olderThan = (now: Date, ms: number) =>
	new Date(now.getTime() - ms).toISOString();

function logFailure(
	payload: Payload,
	stats: PendingStats,
	what: string,
	id: string,
	error: unknown,
) {
	stats.errors += 1;
	payload.logger.error({
		msg: `[payments] reconciliation failed for a ${what}`,
		id,
		err: error,
	});
}

async function reconcileCheckoutIntents(
	payload: Payload,
	now: Date,
	limit: number,
	port: Port,
	stats: PendingStats,
) {
	const { docs } = await payload.find({
		collection: "payment-intents",
		where: {
			and: [
				{ purpose: { equals: "checkout" } },
				{ status: { equals: "pending" } },
				{
					createdAt: {
						less_than: olderThan(now, RECONCILE_CHECKOUT_AFTER_MS),
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
			const provider = await port();
			const report = await fetchOrNull(() =>
				provider.verifyPayment(intent.reference ?? `PI-${intentId}`),
			);
			if (report && report.status !== "pending") {
				const result = await settlePayment(payload, {
					...report,
					source: "reconcile",
					at: now,
				});
				if (result.outcome === "applied") {
					stats.settled += 1;
					continue;
				}
				if (result.outcome === "amount_mismatch") continue;
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
			logFailure(payload, stats, "checkout intent", intentId, error);
		}
	}
}

async function reconcileStaleRefunds(
	payload: Payload,
	now: Date,
	limit: number,
	port: Port,
	stats: PendingStats,
) {
	const { docs } = await payload.find({
		collection: "refunds",
		where: {
			and: [
				{ status: { in: ["pending", "processing"] } },
				{ providerRefundId: { exists: true } },
				{ updatedAt: { less_than: olderThan(now, RECONCILE_MONEY_AFTER_MS) } },
			],
		},
		sort: "updatedAt",
		limit,
		depth: 0,
		overrideAccess: true,
	});
	for (const refund of docs) {
		stats.checked += 1;
		const refundId = String(refund.id);
		const providerRefundId = refund.providerRefundId;
		if (!providerRefundId) continue;
		try {
			const provider = await port();
			const fetched = await fetchOrNull(() =>
				provider.getRefund(providerRefundId),
			);
			if (!fetched || fetched.status === refund.status) continue;
			const { outcome } = await withTransaction(payload, (req) =>
				applyRefundEvent(req, refundEventOf(fetched, `poll:${refundId}`), {
					source: "reconcile",
					now,
				}),
			);
			if (outcome === "applied") stats.refundsApplied += 1;
		} catch (error) {
			logFailure(payload, stats, "refund", refundId, error);
		}
	}
}

async function reconcileStalePayouts(
	payload: Payload,
	now: Date,
	limit: number,
	port: Port,
	stats: PendingStats,
) {
	const { docs } = await payload.find({
		collection: "payouts",
		where: {
			and: [
				{ status: { in: ["pending", "sent", "processing"] } },
				{ providerTransferId: { exists: true } },
				{ updatedAt: { less_than: olderThan(now, RECONCILE_MONEY_AFTER_MS) } },
			],
		},
		sort: "updatedAt",
		limit,
		depth: 0,
		overrideAccess: true,
	});
	for (const payout of docs) {
		stats.checked += 1;
		const payoutId = String(payout.id);
		const transferId = payout.providerTransferId;
		if (!transferId) continue;
		try {
			const provider = await port();
			const fetched = await fetchOrNull(() => provider.getTransfer(transferId));
			if (!fetched || fetched.status === payout.status) continue;
			const outcome = await withTransaction(payload, (req) =>
				applyTransferEvent(req, transferEventOf(fetched, `poll:${payoutId}`), {
					source: "reconcile",
				}),
			);
			if (outcome.applied && outcome.changed) stats.payoutsApplied += 1;
		} catch (error) {
			logFailure(payload, stats, "payout", payoutId, error);
		}
	}
}
