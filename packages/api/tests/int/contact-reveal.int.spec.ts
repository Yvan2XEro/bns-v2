// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { hitRateLimit, MemoryCounterStore } from "../../src/lib/rateLimit";
import {
	CONTACT_PHONE_LIMITS,
	revealContactPhone,
} from "../../src/services/contactReveal";
import { fakePayload } from "./helpers/fakePayload";

const NOW = new Date("2026-09-15T10:00:00.000Z");
const HOUR = 3_600_000;
const later = (ms: number) => new Date(NOW.getTime() + ms);

function world(seller: Record<string, unknown> = {}) {
	return fakePayload(
		{
			users: [{ id: "seller", phone: "+237600000001", ...seller }],
			listings: [
				{ id: "l-live", seller: "seller", status: "published" },
				{ id: "l-draft", seller: "seller", status: "draft" },
			],
		},
		{ uniques: { "contact-reveals": [["viewer", "listing", "revealWindow"]] } },
	);
}

// The fake stamps createdAt with Date, so the clock follows each call's `now`.
const reveal = (
	payload: ReturnType<typeof world>,
	store: MemoryCounterStore,
	now = NOW,
	listingId = "l-live",
	viewerId = "buyer",
) => {
	vi.setSystemTime(now);
	return revealContactPhone(payload, { listingId, viewerId, now }, { store });
};

beforeEach(() => vi.useFakeTimers({ toFake: ["Date"] }));
afterEach(() => vi.useRealTimers());

describe("revealContactPhone", () => {
	it("returns the phone and records one reveal per viewer and listing per day", async () => {
		const payload = world();
		const store = new MemoryCounterStore(() => NOW.getTime());

		expect(await reveal(payload, store)).toEqual({ phone: "+237600000001" });
		await reveal(payload, store, later(HOUR));
		expect(payload.store["contact-reveals"]).toHaveLength(1);
		expect(payload.store["contact-reveals"][0]).toMatchObject({
			listing: "l-live",
			seller: "seller",
			viewer: "buyer",
		});

		await reveal(payload, store, later(25 * HOUR));
		expect(payload.store["contact-reveals"]).toHaveLength(2);
	});

	it("answers listing.notFound for an unpublished or missing listing", async () => {
		const store = new MemoryCounterStore();
		await expect(reveal(world(), store, NOW, "l-draft")).rejects.toMatchObject({
			code: "listing.notFound",
			status: 404,
		});
		await expect(reveal(world(), store, NOW, "nope")).rejects.toMatchObject({
			status: 404,
		});
	});

	it("answers contact.phoneUnavailable when the seller has no phone", async () => {
		await expect(
			reveal(world({ phone: null }), new MemoryCounterStore()),
		).rejects.toMatchObject({
			code: "contact.phoneUnavailable",
			status: 404,
		});
	});

	it("hides the phone of a suspended seller", async () => {
		const payload = world({
			suspendedAt: "2026-09-01T00:00:00.000Z",
			suspendedUntil: null,
		});
		await expect(
			reveal(payload, new MemoryCounterStore()),
		).rejects.toMatchObject({
			code: "contact.phoneUnavailable",
		});
	});

	it("records one row when two reveals race past the lookup", async () => {
		const payload = world();
		const store = new MemoryCounterStore(() => NOW.getTime());
		vi.setSystemTime(NOW);

		const results = await Promise.allSettled([
			revealContactPhone(
				payload,
				{ listingId: "l-live", viewerId: "buyer", now: NOW },
				{ store },
			),
			revealContactPhone(
				payload,
				{ listingId: "l-live", viewerId: "buyer", now: NOW },
				{ store },
			),
		]);

		expect(results.map((result) => result.status)).toEqual([
			"fulfilled",
			"fulfilled",
		]);
		expect(payload.store["contact-reveals"]).toHaveLength(1);
	});

	it("gives a seller their own number without recording a reveal", async () => {
		const payload = world();
		await reveal(payload, new MemoryCounterStore(), NOW, "l-live", "seller");
		expect(payload.store["contact-reveals"] ?? []).toHaveLength(0);
	});

	it("refuses the 21st call in an hour, counting failed calls too", async () => {
		const payload = world();
		const store = new MemoryCounterStore(() => NOW.getTime());
		for (let i = 0; i < 10; i++) await reveal(payload, store);
		for (let i = 0; i < 10; i++) {
			await reveal(payload, store, NOW, "l-draft").catch(() => undefined);
		}
		await expect(reveal(payload, store)).rejects.toMatchObject({
			code: "generic.rateLimited",
			status: 429,
		});
	});

	it("refuses the 61st call in a day even when spread over hours", async () => {
		const payload = world();
		let clock = NOW.getTime();
		const store = new MemoryCounterStore(() => clock);
		for (let hour = 0; hour < 3; hour++) {
			for (let i = 0; i < 20; i++) {
				clock = NOW.getTime() + hour * HOUR + i * 1000;
				await reveal(payload, store, new Date(clock));
			}
		}
		clock = NOW.getTime() + 3 * HOUR;
		await expect(reveal(payload, store, new Date(clock))).rejects.toMatchObject(
			{ status: 429 },
		);
	});
});

describe("hitRateLimit", () => {
	it("keeps the published limits", () => {
		expect(CONTACT_PHONE_LIMITS).toEqual([
			{ name: "contact-phone:hour", limit: 20, windowSeconds: 3600 },
			{ name: "contact-phone:day", limit: 60, windowSeconds: 86400 },
		]);
	});

	it("starts a fresh count in the next window", async () => {
		let clock = 0;
		const store = new MemoryCounterStore(() => clock);
		const windows = [{ name: "t", limit: 1, windowSeconds: 60 }];
		expect(await hitRateLimit(store, "v", windows, clock)).toBe(false);
		expect(await hitRateLimit(store, "v", windows, clock)).toBe(true);
		clock = 61_000;
		expect(await hitRateLimit(store, "v", windows, clock)).toBe(false);
	});

	it("drops the keys of elapsed windows instead of growing forever", async () => {
		let clock = 0;
		const store = new MemoryCounterStore(() => clock);
		const windows = [{ name: "t", limit: 100, windowSeconds: 60 }];
		for (let viewer = 0; viewer < 5; viewer++) {
			await hitRateLimit(store, `v-${viewer}`, windows, clock);
		}
		expect(store.size).toBe(5);

		// Three windows later, none of those keys can ever be hit again.
		clock = 181_000;
		await hitRateLimit(store, "v-0", windows, clock);
		expect(store.size).toBe(1);
	});
});

type AccessArgsLike = {
	req: { user: unknown };
	id?: string;
	doc?: Record<string, unknown>;
};

/** Access helpers take a full PayloadRequest; a test only supplies what they read. */
const run = (fn: unknown, args: AccessArgsLike): unknown => {
	if (typeof fn !== "function") throw new Error("not an access function");
	return (fn as (args: AccessArgsLike) => unknown)(args);
};

const USER = { id: "u-1", role: "user" };
const MOD = { id: "m-1", role: "moderator" };
const ADMIN = { id: "a-1", role: "admin" };

describe("access wiring", () => {
	it("keeps contact-reveals readable by staff only", async () => {
		const { ContactReveals } = await import(
			"../../src/collections/ContactReveals"
		);
		expect(run(ContactReveals.access?.read, { req: { user: USER } })).toBe(
			false,
		);
		expect(run(ContactReveals.access?.read, { req: { user: null } })).toBe(
			false,
		);
		expect(run(ContactReveals.access?.read, { req: { user: MOD } })).toBe(true);
	});

	it.each([
		"create",
		"update",
		"delete",
	] as const)("closes %s on contact-reveals even to admins", async (operation) => {
		const { ContactReveals } = await import(
			"../../src/collections/ContactReveals"
		);
		expect(
			run(ContactReveals.access?.[operation], { req: { user: ADMIN } }),
		).toBe(false);
	});

	it("is unique per viewer, listing and reveal window", async () => {
		const { ContactReveals } = await import(
			"../../src/collections/ContactReveals"
		);
		expect(ContactReveals.indexes).toContainEqual({
			fields: ["viewer", "listing", "revealWindow"],
			unique: true,
		});
	});

	it("hands the phone field to its owner and to staff only", async () => {
		const { Users } = await import("../../src/collections/Users");
		const phone = Users.fields.find(
			(field) => "name" in field && field.name === "phone",
		);
		const read = phone && "access" in phone ? phone.access?.read : undefined;
		expect(read).toBeDefined();
		expect(run(read, { req: { user: USER }, id: "u-1" })).toBe(true);
		expect(run(read, { req: { user: USER }, id: "u-2" })).toBe(false);
		expect(run(read, { req: { user: null }, id: "u-1" })).toBe(false);
		expect(run(read, { req: { user: MOD }, id: "u-2" })).toBe(true);
	});
});
