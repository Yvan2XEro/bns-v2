import { describe, expect, test } from "bun:test";
import {
	type RescheduleValues,
	rescheduleSchema,
	toRescheduleInput,
} from "./reschedule-form";
import { rescheduleChoices } from "./shipment-tracking";

const choices = rescheduleChoices(new Date("2026-10-09T09:00:00.000Z"));

const values = (over: Partial<RescheduleValues> = {}): RescheduleValues => ({
	day: "2026-10-12",
	window: "afternoon",
	landmark: "",
	lat: "",
	lng: "",
	...over,
});

const issues = (input: RescheduleValues) => {
	const parsed = rescheduleSchema.safeParse(input);
	return parsed.success
		? []
		: parsed.error.issues.map((issue) => [issue.path.join("."), issue.message]);
};

describe("rescheduleSchema", () => {
	test("a day and a window are enough", () => {
		expect(issues(values())).toEqual([]);
	});

	test("a day is required", () => {
		expect(issues(values({ day: "" }))).toEqual([["day", "dayRequired"]]);
	});

	test("a new landmark needs 5 to 200 characters when given", () => {
		expect(issues(values({ landmark: "abcd" }))).toEqual([
			["landmark", "landmarkLength"],
		]);
		expect(issues(values({ landmark: "abcde" }))).toEqual([]);
	});

	test("a position needs both coordinates inside their ranges", () => {
		expect(issues(values({ lat: "4.05" }))).toEqual([
			["lat", "positionInvalid"],
		]);
		expect(issues(values({ lat: "91", lng: "9" }))).toEqual([
			["lat", "positionInvalid"],
		]);
		expect(issues(values({ lat: "4.05", lng: "9.7" }))).toEqual([]);
	});
});

describe("toRescheduleInput", () => {
	test("sends the chosen window's start instant and window", () => {
		expect(toRescheduleInput(values(), choices)).toEqual({
			date: "2026-10-12T11:00:00.000Z",
			window: "afternoon",
		});
	});

	test("adds the landmark and the position only when given", () => {
		expect(
			toRescheduleInput(
				values({ landmark: " Face à la pharmacie ", lat: "4.05", lng: "9.7" }),
				choices,
			),
		).toEqual({
			date: "2026-10-12T11:00:00.000Z",
			window: "afternoon",
			landmark: "Face à la pharmacie",
			gps: { lat: 4.05, lng: 9.7 },
		});
	});

	test("never carries a phone field", () => {
		expect(
			Object.keys(toRescheduleInput(values(), choices) ?? {}),
		).not.toContain("phone");
	});

	test("a day or window that is not on offer yields nothing to send", () => {
		expect(
			toRescheduleInput(values({ day: "2026-12-01" }), choices),
		).toBeNull();
		const last = choices.at(-1)?.key ?? "";
		expect(
			toRescheduleInput(values({ day: last, window: "evening" }), choices),
		).toBeNull();
	});
});
