import { createHash } from "node:crypto";
import { parseNotchPayWebhookEvent } from "./payments/notchpay";
import { parseStripeWebhookEvent } from "./payments/stripe";

/**
 * Deterministic, one-way stand-in for a deleted user's id inside a kept
 * record's unique key (payment-intents.idempotencyKey embeds it verbatim).
 * Salted with PAYLOAD_SECRET so the id cannot be recovered from the digest
 * and two users can never anonymise to the same value; deterministic so a
 * re-run of the cascade after a crash converges on the same replacement
 * instead of drifting or colliding with the first attempt's.
 */
export function anonymizeIdentifier(id: string): string {
	return createHash("sha256")
		.update(`account-deletion:${process.env.PAYLOAD_SECRET}:${id}`)
		.digest("hex")
		.slice(0, 32);
}

/**
 * A key-name denylist can only redact fields it already knows about, and a
 * provider payload does not advertise its customer identifiers under a
 * predictable name: Stripe puts a reusable `cus_…` id straight on the
 * session, NotchPay nests an id/reference inside `data.customer`. Rather
 * than chase every shape a provider might add, the kept body is rebuilt
 * from the same normalised fields `parseWebhookEvent` already extracts for
 * processing — the payment's identifiers, its status, the amount/currency
 * and the provider event type — and nothing else survives, customer data
 * included. This also avoids the opposite failure of a denylist: stripping
 * a generic key like `name` wherever it appears, including a line item's
 * product name.
 */
export function retainedWebhookRaw(
	provider: string,
	raw: unknown,
): Record<string, unknown> {
	const normalized =
		provider === "stripe"
			? parseStripeWebhookEvent(raw)
			: parseNotchPayWebhookEvent(raw);
	return { ...normalized };
}
