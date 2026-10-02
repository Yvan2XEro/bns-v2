import { createHmac } from "node:crypto";

/**
 * The refusal score is keyed by a keyed hash, so the collection never holds a
 * phone number: it is behavioural data about a person who never agreed to a
 * reputation file, and a leak of the rows must not be a leak of the numbers.
 * A pepper is required rather than defaulted — a default would silently make
 * every environment's hashes interchangeable.
 */
export function hashDeliveryPhone(pepper: string, e164: string): string {
	return createHmac("sha256", pepper).update(e164).digest("hex");
}

export function requirePhonePepper(env: { ORDER_PHONE_PEPPER?: string }): string {
	const pepper = env.ORDER_PHONE_PEPPER;
	if (!pepper) {
		throw new Error(
			"ORDER_PHONE_PEPPER is not set; refusal scoring cannot run without it",
		);
	}
	return pepper;
}
