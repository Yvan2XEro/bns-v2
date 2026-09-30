import { type Country, parsePhoneNumber } from "react-phone-number-input";

/** Cameroon: the market. Every other country stays reachable through the picker. */
export const DEFAULT_PHONE_COUNTRY: Country = "CM";

/**
 * The stored value, as `PhoneInput` should display it — and nothing more:
 * this never writes back. Numbers already on file predate the control and
 * are not normalized by the server, so they arrive in whatever shape an
 * older screen produced (`+237 6 99 12 44 08`, `699124408`,
 * `00237699124408`, or already `+237699124408`). Parsed under the default
 * country, every one of those shapes resolves to the same number, so the
 * field shows one consistent thing regardless of which shape is on file —
 * and the outer form's held value is untouched until somebody edits it, so
 * saving without editing still sends back exactly what was stored.
 *
 * A value that fails to parse is returned as-is rather than hidden: hiding
 * it would invite someone to "fill in" a number that is actually there.
 */
export function readStoredPhone(
	stored: string,
	country: Country = DEFAULT_PHONE_COUNTRY,
): string | undefined {
	return stored === ""
		? undefined
		: (parsePhoneNumber(stored, country)?.number ?? stored);
}

/**
 * `react-phone-number-input` reports an empty control as `undefined`; every
 * schema behind this field spells "empty" as `""`. Never `null` and never a
 * stray `+` — an empty control must yield an empty string outright.
 */
export function emitPhone(next?: string): string {
	return next ?? "";
}
