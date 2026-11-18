// @vitest-environment node
import { describe, expect, it } from "vitest";
import {
	lastCompleteWeekBounds,
	localDayAndHour,
	localDayStartIso,
	localMonthBounds,
	localMonthOf,
} from "../../src/lib/marketTime";
import { marketMonthBounds, marketWeekBounds } from "../../src/lib/orderMath";
import { monthKeyFor, nextNumber } from "../../src/services/sequences";
import { fakePayload } from "./helpers/fakePayload";

const DOUALA = "Africa/Douala";
const NEW_YORK = "America/New_York";
const OFFSET_MS = 60 * 60 * 1000;

// The fixed-offset arithmetic the code used before the timezone became data.
function dayStartDoualaIso(now: Date): string {
	const local = new Date(now.getTime() + OFFSET_MS);
	const midnight = Date.UTC(
		local.getUTCFullYear(),
		local.getUTCMonth(),
		local.getUTCDate(),
	);
	return new Date(midnight - OFFSET_MS).toISOString();
}

function sampledInstants(count: number): Date[] {
	let seed = 20261010;
	const next = () => {
		seed = (seed * 1664525 + 1013904223) % 2 ** 32;
		return seed / 2 ** 32;
	};
	const from = Date.UTC(2024, 0, 1);
	const span = Date.UTC(2028, 0, 1) - from;
	return Array.from({ length: count }, () => new Date(from + next() * span));
}

describe("local time as a parameter", () => {
	it("cuts the Douala day exactly where the old fixed offset did, over 1,000 instants", () => {
		const instants = sampledInstants(1000);
		expect(instants).toHaveLength(1000);
		for (const at of instants)
			expect(localDayStartIso(at, DOUALA), at.toISOString()).toBe(
				dayStartDoualaIso(at),
			);
	});

	it("puts the day boundary where Intl says across a DST change, not at offset math", () => {
		// 2026-03-08: New York springs forward at 02:00, so midnight is still EST.
		expect(localDayStartIso(new Date("2026-03-08T12:00:00Z"), NEW_YORK)).toBe(
			"2026-03-08T05:00:00.000Z",
		);
		expect(localDayStartIso(new Date("2026-03-09T12:00:00Z"), NEW_YORK)).toBe(
			"2026-03-09T04:00:00.000Z",
		);
		// 2026-11-01: it falls back at 02:00, and the day is 25 hours long.
		expect(localDayStartIso(new Date("2026-11-01T20:00:00Z"), NEW_YORK)).toBe(
			"2026-11-01T04:00:00.000Z",
		);
		expect(localDayStartIso(new Date("2026-11-02T20:00:00Z"), NEW_YORK)).toBe(
			"2026-11-02T05:00:00.000Z",
		);
	});

	it("reads the local month and hour of an instant that is already tomorrow in UTC", () => {
		const at = new Date("2026-10-01T03:30:00Z");
		expect(localMonthOf(at, NEW_YORK)).toEqual({ year: 2026, month: 9 });
		expect(localMonthOf(at, DOUALA)).toEqual({ year: 2026, month: 10 });
		expect(localDayAndHour(at, NEW_YORK)).toEqual({
			year: 2026,
			month: 9,
			day: 30,
			hour: 23,
		});
		expect(monthKeyFor(at, NEW_YORK)).toBe("2609");
		expect(monthKeyFor(at, DOUALA)).toBe("2610");
	});

	it("bounds a New York month and week with the offset each edge actually had", () => {
		expect(
			localMonthBounds(new Date("2026-03-15T12:00:00Z"), NEW_YORK),
		).toEqual({
			start: "2026-03-01T05:00:00.000Z",
			end: "2026-04-01T04:00:00.000Z",
		});
		// Monday 2026-03-09 12:00 local: the last complete week straddles the change.
		expect(
			lastCompleteWeekBounds(new Date("2026-03-09T16:00:00Z"), NEW_YORK),
		).toEqual({
			periodStart: "2026-03-02T05:00:00.000Z",
			periodEnd: "2026-03-09T03:59:59.999Z",
		});
	});

	it("keeps the Douala week and month bounds the fixed-offset code produced", () => {
		expect(
			marketWeekBounds(new Date("2026-10-12T05:00:00Z"), "Africa/Douala"),
		).toEqual({
			periodStart: "2026-10-04T23:00:00.000Z",
			periodEnd: "2026-10-11T22:59:59.999Z",
		});
		expect(
			marketMonthBounds(new Date("2026-09-30T23:30:00Z"), "Africa/Douala"),
		).toEqual({
			start: "2026-09-30T23:00:00.000Z",
			end: "2026-10-31T23:00:00.000Z",
		});
	});
});

describe("sequences keyed by market", () => {
	const CM = { countryCode: "CM", timezone: DOUALA };
	const GH = { countryCode: "GH", timezone: "Africa/Accra" };
	const NOW = new Date("2026-09-15T10:00:00Z");
	const fresh = (rows: { id: string; key: string; value: number }[] = []) =>
		fakePayload({ sequences: rows }, { uniques: { sequences: [["key"]] } });

	it("continues CM's pre-P10 counter from the copied :CM row", async () => {
		const payload = fresh([{ id: "s1", key: "BNS:2609:CM", value: 41 }]);
		expect(await nextNumber(payload, "BNS", NOW, CM)).toBe("BNS-2609-000042");
	});

	it("runs a second market's counter independently in the same month", async () => {
		const payload = fresh([{ id: "s1", key: "BNS:2609:CM", value: 41 }]);
		expect(await nextNumber(payload, "BNS", NOW, CM)).toBe("BNS-2609-000042");
		expect(await nextNumber(payload, "BNS", NOW, GH)).toBe("BNS-2609-000001");
		expect(await nextNumber(payload, "BNS", NOW, GH)).toBe("BNS-2609-000002");
		expect(await nextNumber(payload, "BNS", NOW, CM)).toBe("BNS-2609-000043");
	});

	it("cuts the month on the market's own clock", async () => {
		const payload = fresh();
		const late = new Date("2026-10-01T03:30:00Z");
		expect(
			await nextNumber(payload, "BNS", late, {
				countryCode: "US",
				timezone: NEW_YORK,
			}),
		).toBe("BNS-2609-000001");
		expect(await nextNumber(payload, "BNS", late, CM)).toBe("BNS-2610-000001");
	});
});
