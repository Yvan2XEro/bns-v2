import {
	type LocalParts,
	localDateAt,
	localParts,
	type Weekday,
} from "../marketTime";

export const DELIVERY_DAY_START_HOUR = 8;

export type Day = Weekday;

export interface DeliveryCalendar {
	deliveryDays: readonly Day[];
	cutoffTime?: string;
}

export type DeliveryWindow = "morning" | "afternoon" | "evening";

export type LocalDateTime = LocalParts;

const WEEKDAYS: readonly Day[] = [
	"sun",
	"mon",
	"tue",
	"wed",
	"thu",
	"fri",
	"sat",
];

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
	timezone: string,
): Date {
	let day = date;
	for (let offset = 1; offset <= 7; offset += 1) {
		day = nextLocalDay(day);
		const weekday =
			WEEKDAYS[
				new Date(Date.UTC(day.year, day.month - 1, day.day)).getUTCDay()
			];
		if (deliveryDays.includes(weekday)) {
			return localDateAt(day, DELIVERY_DAY_START_HOUR, 0, timezone);
		}
	}
	throw new RangeError("Delivery calendar has no reachable delivery day");
}

function followingDeliveryTime(
	local: LocalDateTime,
	deliveryDays: readonly Day[],
	timezone: string,
) {
	let day: Pick<LocalDateTime, "year" | "month" | "day"> = local;
	for (let offset = 1; offset <= 7; offset += 1) {
		day = nextLocalDay(day);
		const weekday =
			WEEKDAYS[
				new Date(Date.UTC(day.year, day.month - 1, day.day)).getUTCDay()
			];
		if (deliveryDays.includes(weekday)) {
			return localDateAt(day, local.hour, local.minute, timezone);
		}
	}
	throw new RangeError("Delivery calendar has no reachable delivery day");
}

export function nextDeliveryStart(
	now: Date,
	calendar: DeliveryCalendar,
	timezone: string,
): Date {
	assertCalendar(calendar);
	const localNow = localParts(now, timezone);
	const [cutoffHour, cutoffMinute] = (calendar.cutoffTime ?? "23:59")
		.split(":")
		.map(Number);
	const pastCutoff =
		localNow.hour > cutoffHour ||
		(localNow.hour === cutoffHour && localNow.minute >= cutoffMinute);
	if (calendar.deliveryDays.includes(localNow.weekday) && !pastCutoff) {
		return new Date(now);
	}
	return followingDeliveryStart(localNow, calendar.deliveryDays, timezone);
}

export function promisedByFrom(
	start: Date,
	preparationHours: number,
	etaMaxHours: number,
	calendar: DeliveryCalendar,
	timezone: string,
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
		const local = localParts(cursor, timezone);
		if (!calendar.deliveryDays.includes(local.weekday)) {
			cursor = followingDeliveryTime(local, calendar.deliveryDays, timezone);
			continue;
		}
		cursor = new Date(cursor.getTime() + 3_600_000);
		remainingHours -= 1;
	}
	if (remainingHours > 0) {
		throw new RangeError("Delivery ETA exceeds the supported calendar horizon");
	}
	const local = localParts(cursor, timezone);
	if (!calendar.deliveryDays.includes(local.weekday)) {
		return followingDeliveryTime(local, calendar.deliveryDays, timezone);
	}
	return cursor;
}

export function pickupReadyAt(
	now: Date,
	preparationHours: number,
	openingHours: readonly { day: Day; opens: string; closes: string }[],
	timezone: string,
): Date {
	if (
		!Number.isFinite(now.getTime()) ||
		!Number.isFinite(preparationHours) ||
		preparationHours < 0 ||
		!openingHours.length
	)
		throw new RangeError("Invalid pickup calendar");
	let day = localParts(now, timezone);
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
				localDateAt(day, openHour, openMinute, timezone).getTime(),
			);
			const end = localDateAt(day, closeHour, closeMinute, timezone).getTime();
			if (start >= end) continue;
			if (remaining <= end - start) return new Date(start + remaining);
			remaining -= end - start;
			cursor = end;
		}
		const next = nextLocalDay(day);
		day = localParts(localDateAt(next, 0, 0, timezone), timezone);
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
	timezone: string,
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
	return calendar.deliveryDays.includes(localParts(date, timezone).weekday);
}
