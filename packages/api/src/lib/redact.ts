import { createHash } from "node:crypto";
import { parseNotchPayWebhookEvent } from "./payments/notchpay";
import { parseStripeWebhookEvent } from "./payments/stripe";
import { isRecord, type NormalizedWebhookEvent } from "./payments/types";

/**
 * Deterministic, one-way stand-in for a deleted user's id inside a kept
 * record's unique key (payment-intents.idempotencyKey embeds it verbatim).
 * Salted with PAYLOAD_SECRET so the id cannot be recovered from the digest
 * and two users can never anonymise to the same value; deterministic so a
 * re-run of the cascade after a crash converges on the same replacement
 * instead of drifting or colliding with the first attempt's. An unset
 * secret must fail loudly rather than silently fall back to an unsalted,
 * brute-forceable digest of the id — same rule as auth/oauth/flow.ts.
 */
export function anonymizeIdentifier(id: string): string {
	const secret = process.env.PAYLOAD_SECRET;
	if (!secret) {
		throw new Error("PAYLOAD_SECRET environment variable is not set");
	}
	return createHash("sha256")
		.update(`account-deletion:${secret}:${id}`)
		.digest("hex")
		.slice(0, 32);
}

export interface RetainedWebhookRaw extends NormalizedWebhookEvent {
	/**
	 * Marks a body already rebuilt by `retainedWebhookRaw`. It is no longer
	 * the provider's wire shape, so reprocessing (services/webhookEvents.ts)
	 * must read these fields directly instead of handing it back to
	 * `parseWebhookEvent`, which expects the original nesting and would
	 * silently find no reference in this flat one.
	 */
	redacted: true;
}

export function isRetainedWebhookRaw(
	value: unknown,
): value is RetainedWebhookRaw {
	return isRecord(value) && value.redacted === true;
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
 *
 * Idempotent: a body already rebuilt is returned unchanged rather than fed
 * back through the provider parser, which only understands the original
 * wire shape and would flatten it into nulls on a second pass.
 */
export function retainedWebhookRaw(
	provider: string,
	raw: unknown,
): RetainedWebhookRaw {
	if (isRetainedWebhookRaw(raw)) return raw;
	const normalized =
		provider === "stripe"
			? parseStripeWebhookEvent(raw)
			: parseNotchPayWebhookEvent(raw);
	return { ...normalized, redacted: true };
}
