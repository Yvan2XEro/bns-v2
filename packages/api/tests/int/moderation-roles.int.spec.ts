import { describe, expect, it } from "vitest";
import {
	canActOn,
	canSuspendIndefinitely,
	isModerator,
	isSuspended,
	MAX_MODERATOR_SUSPENSION_DAYS,
	resolveSuspensionUntil,
	roleRank,
	suspensionSummary,
} from "../../src/access/roles";

const at = (iso: string) => new Date(iso);
const NOW = at("2026-08-28T12:00:00.000Z");

describe("roleRank", () => {
	it("orders user below moderator below admin", () => {
		expect(roleRank("user")).toBeLessThan(roleRank("moderator"));
		expect(roleRank("moderator")).toBeLessThan(roleRank("admin"));
	});

	it("treats an unknown or missing role as the lowest rank", () => {
		expect(roleRank(undefined)).toBe(roleRank("user"));
		expect(roleRank("something-else")).toBe(roleRank("user"));
	});
});

describe("canActOn", () => {
	it("lets a moderator act on a plain user", () => {
		expect(canActOn({ role: "moderator" }, { role: "user" })).toBe(true);
	});

	it("refuses a moderator acting on another moderator", () => {
		expect(canActOn({ role: "moderator" }, { role: "moderator" })).toBe(false);
	});

	it("refuses a moderator acting on an admin", () => {
		expect(canActOn({ role: "moderator" }, { role: "admin" })).toBe(false);
	});

	it("lets an admin act on a moderator", () => {
		expect(canActOn({ role: "admin" }, { role: "moderator" })).toBe(true);
	});

	it("refuses an admin acting on another admin", () => {
		expect(canActOn({ role: "admin" }, { role: "admin" })).toBe(false);
	});

	it("refuses a plain user acting on anyone", () => {
		expect(canActOn({ role: "user" }, { role: "user" })).toBe(false);
	});

	it("refuses when there is no actor", () => {
		expect(canActOn(undefined, { role: "user" })).toBe(false);
	});
});

describe("isModerator", () => {
	it("accepts moderators and admins only", () => {
		expect(isModerator({ role: "moderator" })).toBe(true);
		expect(isModerator({ role: "admin" })).toBe(true);
		expect(isModerator({ role: "user" })).toBe(false);
		expect(isModerator(undefined)).toBe(false);
	});
});

describe("isSuspended", () => {
	it("is false when the account was never suspended", () => {
		expect(isSuspended({}, NOW)).toBe(false);
		expect(isSuspended({ suspendedAt: null }, NOW)).toBe(false);
	});

	it("is true for an indefinite suspension", () => {
		expect(
			isSuspended(
				{ suspendedAt: "2026-08-01T00:00:00.000Z", suspendedUntil: null },
				NOW,
			),
		).toBe(true);
	});

	it("is true while a timed suspension is still running", () => {
		expect(
			isSuspended(
				{
					suspendedAt: "2026-08-27T00:00:00.000Z",
					suspendedUntil: "2026-08-29T00:00:00.000Z",
				},
				NOW,
			),
		).toBe(true);
	});

	it("is false once a timed suspension has elapsed", () => {
		expect(
			isSuspended(
				{
					suspendedAt: "2026-08-01T00:00:00.000Z",
					suspendedUntil: "2026-08-27T00:00:00.000Z",
				},
				NOW,
			),
		).toBe(false);
	});

	it("ignores an unparseable suspendedUntil rather than freeing the account", () => {
		expect(
			isSuspended(
				{ suspendedAt: "2026-08-01T00:00:00.000Z", suspendedUntil: "nonsense" },
				NOW,
			),
		).toBe(true);
	});
});

describe("suspensionSummary", () => {
	it("reports an expired suspension as inactive but still expired-flagged", () => {
		const summary = suspensionSummary(
			{
				suspendedAt: "2026-08-01T00:00:00.000Z",
				suspendedUntil: "2026-08-27T00:00:00.000Z",
			},
			NOW,
		);
		expect(summary.active).toBe(false);
		expect(summary.expired).toBe(true);
	});

	it("does not flag a never-suspended account as expired", () => {
		const summary = suspensionSummary({}, NOW);
		expect(summary.active).toBe(false);
		expect(summary.expired).toBe(false);
	});

	it("reports an indefinite suspension with no end date", () => {
		const summary = suspensionSummary(
			{ suspendedAt: "2026-08-01T00:00:00.000Z", suspendedUntil: null },
			NOW,
		);
		expect(summary).toMatchObject({
			active: true,
			expired: false,
			indefinite: true,
			until: null,
		});
	});
});

describe("resolveSuspensionUntil", () => {
	it("gives an admin an indefinite suspension when no duration is asked for", () => {
		expect(
			resolveSuspensionUntil({ role: "admin" }, undefined, NOW),
		).toBeNull();
	});

	it("refuses an indefinite suspension from a moderator", () => {
		expect(() =>
			resolveSuspensionUntil({ role: "moderator" }, undefined, NOW),
		).toThrow();
	});

	it("computes the end date from a day count", () => {
		expect(
			resolveSuspensionUntil({ role: "moderator" }, 7, NOW)?.toISOString(),
		).toBe("2026-09-04T12:00:00.000Z");
	});

	it("caps a moderator at the maximum duration", () => {
		expect(() =>
			resolveSuspensionUntil(
				{ role: "moderator" },
				MAX_MODERATOR_SUSPENSION_DAYS + 1,
				NOW,
			),
		).toThrow();
	});

	it("lets an admin exceed the moderator cap", () => {
		expect(
			resolveSuspensionUntil(
				{ role: "admin" },
				MAX_MODERATOR_SUSPENSION_DAYS + 1,
				NOW,
			),
		).toBeInstanceOf(Date);
	});

	it("refuses a zero or negative duration", () => {
		expect(() => resolveSuspensionUntil({ role: "admin" }, 0, NOW)).toThrow();
		expect(() => resolveSuspensionUntil({ role: "admin" }, -3, NOW)).toThrow();
	});
});

describe("canSuspendIndefinitely", () => {
	it("is reserved to admins", () => {
		expect(canSuspendIndefinitely({ role: "admin" })).toBe(true);
		expect(canSuspendIndefinitely({ role: "moderator" })).toBe(false);
	});
});
