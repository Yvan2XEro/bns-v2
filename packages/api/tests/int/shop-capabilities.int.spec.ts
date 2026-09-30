import { describe, expect, it } from "vitest";
import {
	CAPABILITY_UNLOCKS,
	shopCapabilities,
} from "../../src/lib/shopCapabilities";

const NOW = new Date("2026-10-01T00:00:00.000Z");
const FUTURE = "2027-10-01T00:00:00.000Z";
const PAST = "2026-09-01T00:00:00.000Z";

describe("shopCapabilities", () => {
	it("gives an active level-1 shop COD only", () => {
		expect(shopCapabilities({ status: "active", level: 1 }, NOW)).toEqual({
			effectiveLevel: 1,
			badge: "phone",
			codOrders: true,
			protectedPayment: false,
			teamMembers: false,
			maxMembers: 1,
			supplier: false,
			fasterPayouts: false,
			legalInfoVerified: false,
		});
	});

	it("gives an active level-2 shop protected payment and a team of 5", () => {
		const caps = shopCapabilities(
			{ status: "active", level: 2, levelExpiresAt: FUTURE },
			NOW,
		);
		expect(caps).toMatchObject({
			effectiveLevel: 2,
			badge: "identity",
			protectedPayment: true,
			teamMembers: true,
			maxMembers: 5,
			supplier: false,
			legalInfoVerified: false,
		});
	});

	it("gives an active level-3 shop the supplier flags and a team of 20", () => {
		const caps = shopCapabilities(
			{ status: "active", level: 3, levelExpiresAt: FUTURE },
			NOW,
		);
		expect(caps).toMatchObject({
			effectiveLevel: 3,
			badge: "business",
			supplier: true,
			fasterPayouts: true,
			legalInfoVerified: true,
			maxMembers: 20,
			protectedPayment: true,
		});
	});

	it("drops to level 1 when levelExpiresAt has passed, with no job run", () => {
		for (const level of [2, 3]) {
			const caps = shopCapabilities(
				{ status: "active", level, levelExpiresAt: PAST },
				NOW,
			);
			expect(caps).toMatchObject({
				effectiveLevel: 1,
				badge: "phone",
				protectedPayment: false,
				teamMembers: false,
				maxMembers: 1,
			});
		}
	});

	it("treats a missing levelExpiresAt at level >= 2 as unexpired", () => {
		expect(
			shopCapabilities({ status: "active", level: 2 }, NOW).effectiveLevel,
		).toBe(2);
	});

	it("treats an explicit null levelExpiresAt at level >= 2 as unexpired", () => {
		for (const level of [2, 3]) {
			expect(
				shopCapabilities({ status: "active", level, levelExpiresAt: null }, NOW)
					.effectiveLevel,
			).toBe(level);
		}
	});

	it("treats levelExpiresAt equal to now as already expired", () => {
		const caps = shopCapabilities(
			{ status: "active", level: 2, levelExpiresAt: NOW.toISOString() },
			NOW,
		);
		expect(caps.effectiveLevel).toBe(1);
	});

	it("treats levelExpiresAt one millisecond before now as already expired", () => {
		const oneMsPast = new Date(NOW.getTime() - 1).toISOString();
		const caps = shopCapabilities(
			{ status: "active", level: 2, levelExpiresAt: oneMsPast },
			NOW,
		);
		expect(caps.effectiveLevel).toBe(1);
	});

	it("treats levelExpiresAt one millisecond after now as not yet expired", () => {
		const oneMsFuture = new Date(NOW.getTime() + 1).toISOString();
		const caps = shopCapabilities(
			{ status: "active", level: 2, levelExpiresAt: oneMsFuture },
			NOW,
		);
		expect(caps.effectiveLevel).toBe(2);
	});

	it("empties every capability for a shop that is not active", () => {
		for (const status of ["suspended", "closed"]) {
			for (const level of [1, 2, 3]) {
				expect(
					shopCapabilities({ status, level, levelExpiresAt: FUTURE }, NOW),
				).toEqual({
					effectiveLevel: 0,
					badge: null,
					codOrders: false,
					protectedPayment: false,
					teamMembers: false,
					maxMembers: 1,
					supplier: false,
					fasterPayouts: false,
					legalInfoVerified: false,
				});
			}
		}
	});

	it("treats a missing or zero level on an active shop as level 1", () => {
		expect(
			shopCapabilities({ status: "active", level: 0 }, NOW).effectiveLevel,
		).toBe(1);
		expect(shopCapabilities({ status: "active" }, NOW).effectiveLevel).toBe(1);
	});

	it("names exactly what each next level adds", () => {
		expect(CAPABILITY_UNLOCKS[2]).toEqual(["protectedPayment", "teamMembers"]);
		expect(CAPABILITY_UNLOCKS[3]).toEqual([
			"supplier",
			"fasterPayouts",
			"legalInfoVerified",
		]);
	});
});
