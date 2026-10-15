import { describe, expect, test } from "bun:test";
import { chipsWithMore, hoursSpans } from "./delivery-overview";

describe("hoursSpans", () => {
	test("merges consecutive days with the same hours and closed days", () => {
		const weekday = { opens: "09:00", closes: "19:00" };
		expect(
			hoursSpans([
				{ day: "mon", ...weekday },
				{ day: "tue", ...weekday },
				{ day: "wed", ...weekday },
				{ day: "thu", ...weekday },
				{ day: "fri", ...weekday },
				{ day: "sat", opens: "09:00", closes: "17:00" },
			]),
		).toEqual([
			{ first: "mon", last: "fri", hours: weekday },
			{ first: "sat", last: "sat", hours: { opens: "09:00", closes: "17:00" } },
			{ first: "sun", last: "sun", hours: null },
		]);
	});

	test("reads no rows as a closed week", () => {
		expect(hoursSpans(null)).toEqual([
			{ first: "mon", last: "sun", hours: null },
		]);
	});
});

describe("chipsWithMore", () => {
	test("counts what is hidden", () => {
		expect(chipsWithMore([1, 2, 3, 4, 5, 6, 7])).toEqual({
			visible: [1, 2, 3, 4, 5],
			more: 2,
		});
	});
});
