export const DELIVERY_TIMEZONE = "Africa/Douala";
export const DELIVERY_DAY_START_HOUR = 8;

export type Day = "mon" | "tue" | "wed" | "thu" | "fri" | "sat" | "sun";

export interface DeliveryCalendar {
	deliveryDays: readonly Day[];
	cutoffTime?: string;
}

export type DeliveryWindow = "morning" | "afternoon" | "evening";

interface LocalDateTime {
	year: number;
	month: number;
	day: number;
	weekday: Day;
	hour: number;
	minute: number;
}

const WEEKDAYS: readonly Day[] = [
	"sun",
	"mon",
	"tue",
	"wed",
	"thu",
	"fri",
	"sat",
];

function localParts(date: Date): LocalDateTime {
	if (!Number.isFinite(date.getTime())) throw new RangeError("Invalid date");
	const parts = new Intl.DateTimeFormat("en-GB", {
		timeZone: DELIVERY_TIMEZONE,
		year: "numeric",
		month: "2-digit",
		day: "2-digit",
		weekday: "short",
		hour: "2-digit",
		minute: "2-digit",
		hourCycle: "h23",
	}).formatToParts(date);
	const value = (type: Intl.DateTimeFormatPartTypes) =>
		parts.find((part) => part.type === type)?.value ?? "";
	return {
		year: Number(value("year")),
		month: Number(value("month")),
		day: Number(value("day")),
		weekday: value("weekday").slice(0, 3).toLowerCase() as Day,
		hour: Number(value("hour")),
		minute: Number(value("minute")),
	};
}

function localDateAt(
	date: Pick<LocalDateTime, "year" | "month" | "day">,
	hour: number,
	minute = 0,
): Date {
	const target = Date.UTC(date.year, date.month - 1, date.day, hour, minute);
	let timestamp = target;
	for (let attempt = 0; attempt < 3; attempt += 1) {
		const observed = localParts(new Date(timestamp));
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

function nextLocalDay(date: Pick<LocalDateTime, "year" | "month" | "day">) {
	const next = new Date(Date.UTC(date.year, date.month - 1, date.day + 1));
	return {
		year: next.getUTCFullYear(),
		month: next.getUTCMonth() + 1,
		day: next.getUTCDate(),
	};
}

function assertCalendar(calendar: DeliveryCalendar): void {
	if (calendar.deliveryDays.length === 0) {
		throw new RangeError("Delivery calendar must include at least one day");
	}
	if (
		calendar.cutoffTime !== undefined &&
		!/^([01]\d|2[0-3]):[0-5]\d$/.test(calendar.cutoffTime)
	) {
		throw new RangeError("Delivery cutoff must use HH:mm format");
	}
}

function followingDeliveryStart(
	date: Pick<LocalDateTime, "year" | "month" | "day">,
	deliveryDays: readonly Day[],
): Date {
	let day = date;
	for (let offset = 1; offset <= 7; offset += 1) {
		day = nextLocalDay(day);
		const weekday =
			WEEKDAYS[
				new Date(Date.UTC(day.year, day.month - 1, day.day)).getUTCDay()
			];
		if (deliveryDays.includes(weekday)) {
			return localDateAt(day, DELIVERY_DAY_START_HOUR);
		}
	}
	throw new RangeError("Delivery calendar has no reachable delivery day");
}

function followingDeliveryTime(
	local: LocalDateTime,
	deliveryDays: readonly Day[],
) {
	let day: Pick<LocalDateTime, "year" | "month" | "day"> = local;
	for (let offset = 1; offset <= 7; offset += 1) {
		day = nextLocalDay(day);
		const weekday =
			WEEKDAYS[
				new Date(Date.UTC(day.year, day.month - 1, day.day)).getUTCDay()
			];
		if (deliveryDays.includes(weekday)) {
			return localDateAt(day, local.hour, local.minute);
		}
	}
	throw new RangeError("Delivery calendar has no reachable delivery day");
}

export function nextDeliveryStart(now: Date, calendar: DeliveryCalendar): Date {
	assertCalendar(calendar);
	const localNow = localParts(now);
	const [cutoffHour, cutoffMinute] = (calendar.cutoffTime ?? "23:59")
		.split(":")
		.map(Number);
	const pastCutoff =
		localNow.hour > cutoffHour ||
		(localNow.hour === cutoffHour && localNow.minute >= cutoffMinute);
	if (calendar.deliveryDays.includes(localNow.weekday) && !pastCutoff) {
		return new Date(now);
	}
	return followingDeliveryStart(localNow, calendar.deliveryDays);
}

export function promisedByFrom(
	start: Date,
	preparationHours: number,
	etaMaxHours: number,
	calendar: DeliveryCalendar,
): Date {
	assertCalendar(calendar);
	const hours = preparationHours + etaMaxHours;
	if (!Number.isFinite(hours) || preparationHours < 0 || etaMaxHours < 0) {
		throw new RangeError("Delivery hours must be finite and non-negative");
	}
	let cursor = new Date(start);
	let remainingHours = Math.ceil(hours);
	let guard = 0;
	while (remainingHours > 0 && guard < 24 * 366) {
		guard += 1;
		const local = localParts(cursor);
		if (!calendar.deliveryDays.includes(local.weekday)) {
			cursor = followingDeliveryTime(local, calendar.deliveryDays);
			continue;
		}
		cursor = new Date(cursor.getTime() + 3_600_000);
		remainingHours -= 1;
	}
	if (remainingHours > 0) {
		throw new RangeError("Delivery ETA exceeds the supported calendar horizon");
	}
	const local = localParts(cursor);
	if (!calendar.deliveryDays.includes(local.weekday)) {
		return followingDeliveryTime(local, calendar.deliveryDays);
	}
	return cursor;
}

export function pickupReadyAt(
	now: Date,
	preparationHours: number,
	openingHours: readonly { day: Day; opens: string; closes: string }[],
): Date {
	if (
		!Number.isFinite(now.getTime()) ||
		!Number.isFinite(preparationHours) ||
		preparationHours < 0 ||
		!openingHours.length
	)
		throw new RangeError("Invalid pickup calendar");
	let day = localParts(now);
	let remaining = preparationHours * 3_600_000;
	let cursor = now.getTime();
	for (let offset = 0; offset < 366; offset += 1) {
		const periods = openingHours
			.filter((row) => row.day === day.weekday)
			.sort((a, b) => a.opens.localeCompare(b.opens));
		for (const period of periods) {
			if (
				!/^([01]\d|2[0-3]):[0-5]\d$/.test(period.opens) ||
				!/^([01]\d|2[0-3]):[0-5]\d$/.test(period.closes) ||
				period.opens >= period.closes
			)
				throw new RangeError("Invalid pickup opening hours");
			const [openHour, openMinute] = period.opens.split(":").map(Number);
			const [closeHour, closeMinute] = period.closes.split(":").map(Number);
			const start = Math.max(
				cursor,
				localDateAt(day, openHour, openMinute).getTime(),
			);
			const end = localDateAt(day, closeHour, closeMinute).getTime();
			if (start >= end) continue;
			if (remaining <= end - start) return new Date(start + remaining);
			remaining -= end - start;
			cursor = end;
		}
		const next = nextLocalDay(day);
		day = localParts(localDateAt(next, 0));
	}
	throw new RangeError("Pickup calendar exceeds the supported horizon");
}

export function windowBounds(window: DeliveryWindow): {
	fromHour: number;
	toHour: number;
} {
	switch (window) {
		case "morning":
			return { fromHour: 8, toHour: 12 };
		case "afternoon":
			return { fromHour: 12, toHour: 16 };
		case "evening":
			return { fromHour: 16, toHour: 20 };
	}
}

export function rescheduleDateAllowed(
	date: Date,
	calendar: DeliveryCalendar,
	now: Date,
): boolean {
	if (
		calendar.deliveryDays.length === 0 ||
		!Number.isFinite(date.getTime()) ||
		!Number.isFinite(now.getTime())
	) {
		return false;
	}
	const timestamp = date.getTime();
	if (
		timestamp <= now.getTime() ||
		timestamp > now.getTime() + 7 * 86_400_000
	) {
		return false;
	}
	return calendar.deliveryDays.includes(localParts(date).weekday);
}
