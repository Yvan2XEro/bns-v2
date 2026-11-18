export type Weekday = "mon" | "tue" | "wed" | "thu" | "fri" | "sat" | "sun";

export interface LocalParts {
	year: number;
	month: number;
	day: number;
	weekday: Weekday;
	hour: number;
	minute: number;
}

export interface LocalDay {
	year: number;
	month: number;
	day: number;
}

/**
 * The zone the pre-market code assumed. Only the pure helpers that untouched
 * callers still invoke bare, and the nightly jobs that have no single market,
 * fall back to it; every shop-scoped path passes its market's timezone.
 */
export const LEGACY_TIMEZONE = "Africa/Douala";

const formatters = new Map<string, Intl.DateTimeFormat>();

function formatter(timezone: string): Intl.DateTimeFormat {
	let known = formatters.get(timezone);
	if (!known) {
		known = new Intl.DateTimeFormat("en-GB", {
			timeZone: timezone,
			year: "numeric",
			month: "2-digit",
			day: "2-digit",
			weekday: "short",
			hour: "2-digit",
			minute: "2-digit",
			hourCycle: "h23",
		});
		formatters.set(timezone, known);
	}
	return known;
}

export function localParts(date: Date, timezone: string): LocalParts {
	if (!Number.isFinite(date.getTime())) throw new RangeError("Invalid date");
	const parts = formatter(timezone).formatToParts(date);
	const value = (type: Intl.DateTimeFormatPartTypes) =>
		parts.find((part) => part.type === type)?.value ?? "";
	return {
		year: Number(value("year")),
		month: Number(value("month")),
		day: Number(value("day")),
		weekday: value("weekday").slice(0, 3).toLowerCase() as Weekday,
		hour: Number(value("hour")),
		minute: Number(value("minute")),
	};
}

/** The zone's wall-clock day plus hour — distinct from localTime's {date,hour} shape. */
export function localDayAndHour(
	now: Date,
	timezone: string,
): LocalDay & { hour: number } {
	const { year, month, day, hour } = localParts(now, timezone);
	return { year, month, day, hour };
}

/** The instant at which the zone's wall clock reads this date and time. */
export function localDateAt(
	day: LocalDay,
	hour: number,
	minute: number,
	timezone: string,
): Date {
	const target = Date.UTC(day.year, day.month - 1, day.day, hour, minute);
	let timestamp = target;
	for (let attempt = 0; attempt < 3; attempt += 1) {
		const observed = localParts(new Date(timestamp), timezone);
		const observedAsUtc = Date.UTC(
			observed.year,
			observed.month - 1,
			observed.day,
			observed.hour,
			observed.minute,
		);
		timestamp += target - observedAsUtc;
	}
	return new Date(timestamp);
}

/** `YYYY-MM-DD` on the zone's wall calendar. */
export function localDateString(now: Date, timezone: string): string {
	const { year, month, day } = localParts(now, timezone);
	return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

export function localDayStartIso(now: Date, timezone: string): string {
	return localDateAt(localParts(now, timezone), 0, 0, timezone).toISOString();
}

export function localMonthOf(
	now: Date,
	timezone: string,
): { year: number; month: number } {
	const { year, month } = localParts(now, timezone);
	return { year, month };
}

/** `YYMM`, the sequence month key. */
export function localMonthKey(now: Date, timezone: string): string {
	const { year, month } = localMonthOf(now, timezone);
	return `${String(year % 100).padStart(2, "0")}${String(month).padStart(2, "0")}`;
}

export function shiftDays(day: LocalDay, amount: number): LocalDay {
	const moved = new Date(Date.UTC(day.year, day.month - 1, day.day + amount));
	return {
		year: moved.getUTCFullYear(),
		month: moved.getUTCMonth() + 1,
		day: moved.getUTCDate(),
	};
}

const MONDAY_FIRST: readonly Weekday[] = [
	"mon",
	"tue",
	"wed",
	"thu",
	"fri",
	"sat",
	"sun",
];

/** The last complete Monday-to-Sunday week: `periodEnd` is the final millisecond. */
export function lastCompleteWeekBounds(
	now: Date,
	timezone: string,
): { periodStart: string; periodEnd: string } {
	const today = localParts(now, timezone);
	const thisMonday = shiftDays(today, -MONDAY_FIRST.indexOf(today.weekday));
	const start = localDateAt(shiftDays(thisMonday, -7), 0, 0, timezone);
	const end = localDateAt(thisMonday, 0, 0, timezone);
	return {
		periodStart: start.toISOString(),
		periodEnd: new Date(end.getTime() - 1).toISOString(),
	};
}

/** The calendar month holding `now`: `start` inclusive, `end` exclusive. */
export function localMonthBounds(
	now: Date,
	timezone: string,
): { start: string; end: string } {
	const { year, month } = localMonthOf(now, timezone);
	const next =
		month === 12 ? { year: year + 1, month: 1 } : { year, month: month + 1 };
	return {
		start: localDateAt({ year, month, day: 1 }, 0, 0, timezone).toISOString(),
		end: localDateAt({ ...next, day: 1 }, 0, 0, timezone).toISOString(),
	};
}
