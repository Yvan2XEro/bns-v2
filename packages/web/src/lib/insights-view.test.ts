import { describe, expect, test } from "bun:test";
import {
	dormantLastSale,
	formatMinutes,
	meterFill,
	meterTone,
	slowestResponseDay,
	weeklyChange,
} from "./insights-view";

describe("insights meters", () => {
	test("tones a rate against its threshold", () => {
		expect(meterTone(0.12, 0.1)).toBe("ko");
		expect(meterTone(0.06, 0.1)).toBe("warn");
		expect(meterTone(0.02, 0.1)).toBe("ok");
	});

	test("puts the threshold at the middle of the bar and caps the fill", () => {
		expect(meterFill(0.1, 0.1)).toBe(50);
		expect(meterFill(0.5, 0.1)).toBe(100);
	});
});

describe("formatMinutes", () => {
	test("reads minutes, then hours and minutes", () => {
		expect(formatMinutes(38)).toBe("38 min");
		expect(formatMinutes(110)).toBe("1 h 50");
		expect(formatMinutes(180)).toBe("3 h");
		expect(formatMinutes(65)).toBe("1 h 05");
	});
});

describe("weeklyChange", () => {
	const week = (gmvDelivered: number) => ({
		from: "",
		to: "",
		gmvDelivered,
		ordersDelivered: 0,
	});

	test("compares the last week with the one before", () => {
		expect(weeklyChange([week(100), week(125)])).toBe(0.25);
	});

	test("has nothing to say without a base", () => {
		expect(weeklyChange([week(0), week(125)])).toBeNull();
	});
});

describe("dormant last sale (W35)", () => {
	const item = {
		productId: "p",
		productTitle: "P",
		available: 1,
		costValue: 0,
	};

	test("reads the server's day count", () => {
		expect(dormantLastSale({ ...item, daysSinceLastSale: 42 })).toEqual({
			kind: "days",
			days: 42,
		});
		expect(dormantLastSale({ ...item, daysSinceLastSale: 0 })).toEqual({
			kind: "today",
		});
	});

	test("never sold is not the same as unknown", () => {
		expect(dormantLastSale({ ...item, daysSinceLastSale: null })).toEqual({
			kind: "never",
		});
		expect(dormantLastSale(item)).toBeNull();
	});
});

describe("slowestResponseDay", () => {
	test("names the day with the longest median reply", () => {
		expect(
			slowestResponseDay([
				{ date: "2026-10-03", medianMinutes: 40, answered: 1 },
				{ date: "2026-10-04", medianMinutes: 160, answered: 2 },
				{ date: "2026-10-05", medianMinutes: null, answered: 0 },
			]),
		).toEqual({ date: "2026-10-04", medianMinutes: 160, answered: 2 });
	});

	test("says nothing with fewer than two measured days", () => {
		expect(
			slowestResponseDay([
				{ date: "2026-10-04", medianMinutes: 160, answered: 2 },
				{ date: "2026-10-05", medianMinutes: null, answered: 0 },
			]),
		).toBeNull();
		expect(slowestResponseDay(undefined)).toBeNull();
	});
});
