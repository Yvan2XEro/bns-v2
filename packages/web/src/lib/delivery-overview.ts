import { ZONE_DAYS, type ZoneDay } from "./delivery-zone-form";

export interface HoursSpan {
	first: ZoneDay;
	last: ZoneDay;
	/** Null for a closed run. */
	hours: { opens: string; closes: string } | null;
}

/**
 * The week as runs of consecutive days sharing the same hours ("Mon – Fri
 * 9:00 – 19:00", "Sat 9:00 – 17:00", "Sun closed"), in week order.
 */
export function hoursSpans(
	rows:
		| readonly { day: ZoneDay; opens: string; closes: string }[]
		| null
		| undefined,
): HoursSpan[] {
	const byDay = new Map((rows ?? []).map((row) => [row.day, row]));
	const spans: HoursSpan[] = [];
	for (const day of ZONE_DAYS) {
		const row = byDay.get(day);
		const hours = row ? { opens: row.opens, closes: row.closes } : null;
		const previous = spans.at(-1);
		if (
			previous &&
			previous.hours?.opens === hours?.opens &&
			previous.hours?.closes === hours?.closes
		) {
			previous.last = day;
		} else {
			spans.push({ first: day, last: day, hours });
		}
	}
	return spans;
}

/** The first `shown` labels, and how many more there are. */
export function chipsWithMore<T>(
	items: readonly T[],
	shown = 5,
): { visible: T[]; more: number } {
	return {
		visible: items.slice(0, shown),
		more: Math.max(items.length - shown, 0),
	};
}
