/**
 * Coerces a stored date (a `Date`, an ISO string, or nothing) into a `Date`,
 * or `null` when the value is missing or unparseable. Shared by any module
 * that reads a Payload date field and needs to compare it against `now`.
 */
export function toDate(value: string | Date | null | undefined): Date | null {
	if (!value) return null;
	const date = value instanceof Date ? value : new Date(value);
	return Number.isNaN(date.getTime()) ? null : date;
}
