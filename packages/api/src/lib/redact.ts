export const REDACTED = "[redacted]";

const PERSONAL_KEYS = new Set([
	"email",
	"name",
	"phone",
	"customer_email",
	"customer_name",
	"customer_phone",
	"customer_details",
	"address",
	"billing_details",
	"shipping_details",
	"shipping",
]);

/** Deep copy of a provider payload with the customer's identity removed. */
export function redactPersonalData(value: unknown): unknown {
	if (Array.isArray(value)) return value.map(redactPersonalData);
	if (value && typeof value === "object") {
		return Object.fromEntries(
			Object.entries(value).map(([key, entry]) => [
				key,
				PERSONAL_KEYS.has(key) ? REDACTED : redactPersonalData(entry),
			]),
		);
	}
	return value;
}
