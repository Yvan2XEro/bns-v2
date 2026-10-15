export interface LocalDateAndHour {
	/** `YYYY-MM-DD` in the zone. */
	date: string;
	/** 0-23 in the zone. */
	hour: number;
}

export function localDateAndHour(
	now: Date,
	timeZone: string,
): LocalDateAndHour {
	const parts = new Intl.DateTimeFormat("en-CA", {
		timeZone,
		year: "numeric",
		month: "2-digit",
		day: "2-digit",
		hour: "2-digit",
		hourCycle: "h23",
	}).formatToParts(now);
	const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
	return {
		date: `${get("year")}-${get("month")}-${get("day")}`,
		hour: Number(get("hour")),
	};
}
