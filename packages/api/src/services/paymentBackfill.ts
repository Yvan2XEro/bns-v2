import type { Payload } from "payload";
import type { IntentStatus } from "../lib/paymentTransitions";
import { relationId } from "../lib/relationId";
import type { TxReq } from "../lib/transactions";
import { INTENT_TTL_MS } from "./payments";

export function legacyIntentStatus(
	boostStatus: string | null | undefined,
	createdAt: string | null | undefined,
	now: Date,
): { status: IntentStatus; note: string | null } {
	if (boostStatus === "completed") return { status: "succeeded", note: null };
	if (boostStatus === "failed") return { status: "failed", note: null };
	if (boostStatus === "refunded") {
		return {
			status: "succeeded",
			note: "legacy: boost payment was marked refunded",
		};
	}
	const age = createdAt
		? now.getTime() - new Date(createdAt).getTime()
		: Number.POSITIVE_INFINITY;
	return age > INTENT_TTL_MS
		? { status: "expired", note: "legacy: pending for more than 24 hours" }
		: { status: "pending", note: null };
}

/**
 * Gives every boost payment created before P0 its payment intent. Idempotent:
 * linked records are skipped and an intent already created for `BOOST-{id}` is
 * reused, so an interrupted run can simply be started again.
 */
export async function backfillBoostPaymentIntents(
	payload: Payload,
	{ now = new Date(), req }: { now?: Date; req?: TxReq } = {},
): Promise<{ created: number; linked: number }> {
	const result = { created: 0, linked: 0 };

	// Always page 1: every processed record leaves the "unlinked" set.
	for (;;) {
		const batch = await payload.find({
			collection: "boost-payments",
			where: { paymentIntent: { exists: false } },
			depth: 0,
			limit: 100,
			overrideAccess: true,
			req,
		});
		if (batch.docs.length === 0) break;

		for (const boost of batch.docs) {
			const boostId = String(boost.id);
			const reference = `BOOST-${boostId}`;
			const existing = await payload.find({
				collection: "payment-intents",
				where: { reference: { equals: reference } },
				limit: 1,
				depth: 0,
				overrideAccess: true,
				req,
			});

			let intentId = existing.docs[0] ? String(existing.docs[0].id) : null;
			const { status, note } = legacyIntentStatus(
				boost.status,
				boost.createdAt,
				now,
			);

			if (!intentId) {
				const createdAt = boost.createdAt ?? now.toISOString();
				const intent = await payload.create({
					collection: "payment-intents",
					depth: 0,
					overrideAccess: true,
					req,
					data: {
						purpose: "boost",
						targetType: "boost-payment",
						targetId: boostId,
						customer: relationId(boost.user) ?? undefined,
						amount: boost.amount,
						currency: "XAF",
						provider: boost.paymentProvider,
						providerReference: boost.paymentReference ?? undefined,
						reference,
						status,
						statusHistory: [
							{
								status,
								source: "system",
								at: boost.updatedAt ?? createdAt,
								note: note ?? "legacy: migrated from boost-payments",
							},
						],
						idempotencyKey: `legacy:${boostId}`,
						checkoutUrl: boost.paymentUrl ?? undefined,
						expiresAt: new Date(
							new Date(createdAt).getTime() + INTENT_TTL_MS,
						).toISOString(),
						...(status === "succeeded"
							? { settledAmount: boost.amount, settledCurrency: "XAF" }
							: {}),
					},
				});
				intentId = String(intent.id);
				result.created += 1;
			}

			await payload.update({
				collection: "boost-payments",
				id: boostId,
				depth: 0,
				overrideAccess: true,
				req,
				data: {
					paymentIntent: intentId,
					...(status === "expired" && boost.status === "pending"
						? { status: "failed" as const }
						: {}),
				},
			});
			result.linked += 1;
		}
	}

	return result;
}
