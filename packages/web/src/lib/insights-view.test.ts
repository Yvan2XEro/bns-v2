import { describe, expect, test } from "bun:test";
import {
	formatMinutes,
	meterFill,
	meterTone,
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
