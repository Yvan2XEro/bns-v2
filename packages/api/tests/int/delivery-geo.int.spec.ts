// @vitest-environment node
import { describe, expect, it } from "vitest";
import { distanceMeters, haversineMeters } from "../../src/lib/delivery/geo";

describe("haversineMeters", () => {
	it("matches the known short Douala distance, is symmetric and returns zero for one point", () => {
		const from = { lat: 4.05, lng: 9.7 };
		const to = { lat: 4.05, lng: 9.71 };

		expect(haversineMeters(from, from)).toBe(0);
		expect(haversineMeters(from, to)).toBeGreaterThanOrEqual(1108);
		expect(haversineMeters(from, to)).toBeLessThanOrEqual(1112);
		expect(haversineMeters(from, to)).toBe(haversineMeters(to, from));
		expect(distanceMeters(from, to)).toBe(haversineMeters(from, to));
	});
});
