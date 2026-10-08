import { describe, expect, it } from "bun:test";
import { sparklineHeights } from "./insightChart";

describe("sparklineHeights", () => {
	it("normalizes a series while preserving its order", () => {
		expect(sparklineHeights([1, 2, 4])).toEqual([25, 50, 100]);
	});

	it("returns zero-height points for an empty or zero series", () => {
		expect(sparklineHeights([])).toEqual([]);
		expect(sparklineHeights([0, 0])).toEqual([0, 0]);
	});
});
