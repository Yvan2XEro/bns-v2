// @vitest-environment node
import { describe, expect, it } from "vitest";
import { ERROR_CODES, fallbackMessage } from "../../src/lib/errors";
import {
	addDays,
	closedHandleReleased,
	isPreviousHandleActive,
	nextHandleChangeAt,
	normalizeHandle,
	pruneExpiredHandles,
	releasedHandleFor,
	validateHandle,
} from "../../src/lib/shopHandle";

const NOW = new Date("2026-09-15T12:00:00.000Z");

describe("normalizeHandle", () => {
	it("trims, lowercases and drops a leading @", () => {
		expect(normalizeHandle("  @AkwaTech ")).toBe("akwatech");
	});

	it("returns an empty string for anything that is not a string", () => {
		expect(normalizeHandle(42)).toBe("");
		expect(normalizeHandle(null)).toBe("");
	});
});

describe("validateHandle", () => {
	it("accepts lowercase letters, digits and inner hyphens", () => {
		expect(validateHandle("akwa-tech-237")).toEqual({
			ok: true,
			handle: "akwa-tech-237",
		});
	});

	it("normalises case before validating", () => {
		expect(validateHandle("AKWATECH")).toEqual({
			ok: true,
			handle: "akwatech",
		});
	});

	it("refuses fewer than 3 or more than 30 characters", () => {
		expect(validateHandle("ab")).toMatchObject({
			ok: false,
			reason: "invalid",
		});
		expect(validateHandle("a".repeat(31))).toMatchObject({
			ok: false,
			reason: "invalid",
		});
		expect(validateHandle("a".repeat(30))).toMatchObject({ ok: true });
	});

	it("refuses leading, trailing and double hyphens", () => {
		expect(validateHandle("-akwa")).toMatchObject({ reason: "invalid" });
		expect(validateHandle("akwa-")).toMatchObject({ reason: "invalid" });
		expect(validateHandle("akwa--tech")).toMatchObject({ reason: "invalid" });
	});

	it("refuses characters outside a-z, 0-9 and hyphen", () => {
		expect(validateHandle("akwa_tech")).toMatchObject({ reason: "invalid" });
		expect(validateHandle("akwé")).toMatchObject({ reason: "invalid" });
		expect(validateHandle("akwa tech")).toMatchObject({ reason: "invalid" });
	});

	it("refuses reserved words and web route segments", () => {
		for (const word of [
			"admin",
			"boutique",
			"shop",
			"search",
			"seller",
			"listing",
			"handle-available",
		]) {
			expect(validateHandle(word)).toMatchObject({
				ok: false,
				reason: "reserved",
			});
		}
	});

	it("reserves the shape used for released handles of closed shops", () => {
		expect(
			validateHandle(releasedHandleFor("65f1c0ffee00000000000001")),
		).toMatchObject({
			ok: false,
			reason: "reserved",
		});
	});
});

describe("handle cooldown", () => {
	it("allows a change when the handle was never changed", () => {
		expect(nextHandleChangeAt(null, NOW)).toBeNull();
	});

	it("blocks a change for 30 days after the last one", () => {
		const changed = new Date("2026-09-01T12:00:00.000Z");
		expect(nextHandleChangeAt(changed, NOW)?.toISOString()).toBe(
			"2026-10-01T12:00:00.000Z",
		);
	});

	it("allows a change once 30 days have passed", () => {
		expect(nextHandleChangeAt("2026-08-16T12:00:00.000Z", NOW)).toBeNull();
	});
});

describe("previous handles", () => {
	it("stays active until its end date", () => {
		expect(isPreviousHandleActive({ until: addDays(NOW, 1) }, NOW)).toBe(true);
		expect(isPreviousHandleActive({ until: addDays(NOW, -1) }, NOW)).toBe(
			false,
		);
		expect(isPreviousHandleActive({ until: null }, NOW)).toBe(false);
	});

	it("prunes expired entries", () => {
		const entries = [
			{ handle: "old", until: addDays(NOW, -1).toISOString() },
			{ handle: "recent", until: addDays(NOW, 10).toISOString() },
		];
		expect(pruneExpiredHandles(entries, NOW).map((e) => e.handle)).toEqual([
			"recent",
		]);
	});

	it("releases a closed shop's handle after 90 days", () => {
		expect(closedHandleReleased(addDays(NOW, -89), NOW)).toBe(false);
		expect(closedHandleReleased(addDays(NOW, -90), NOW)).toBe(true);
		expect(closedHandleReleased(null, NOW)).toBe(false);
	});
});

describe("shop error codes", () => {
	it("has an English fallback for every new code", () => {
		for (const code of [
			ERROR_CODES.shopDisabled,
			ERROR_CODES.shopPhoneNotVerified,
			ERROR_CODES.shopLimitReached,
			ERROR_CODES.shopHandleInvalid,
			ERROR_CODES.shopHandleReserved,
			ERROR_CODES.shopHandleTaken,
			ERROR_CODES.shopHandleCooldown,
			ERROR_CODES.shopNotMember,
			ERROR_CODES.shopInactive,
			ERROR_CODES.shopNotFound,
			ERROR_CODES.stockNegative,
		]) {
			expect(fallbackMessage(code)).not.toBe(
				fallbackMessage(ERROR_CODES.unknown),
			);
		}
	});
});
