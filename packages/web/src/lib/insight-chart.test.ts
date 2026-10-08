import { describe, expect, it } from "bun:test";
import { insightPolyline } from "./insight-chart";

describe("insightPolyline", () => {
	it("maps ordered observations to a chart line using the series own scale", () => {
		expect(insightPolyline([0, 5, 10], 100, 100)).toBe("0,100 50,50 100,0");
	});

	it("centers a single point and keeps empty series empty", () => {
		expect(insightPolyline([8], 100, 100)).toBe("50,0");
		expect(insightPolyline([], 100, 100)).toBe("");
	});
});
