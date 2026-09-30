// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
	__resetShopLevelListeners,
	onShopLevelChanged,
} from "../../src/services/shops";
import { recomputeShopLevel } from "../../src/services/verificationLevel";
import { fakePayload } from "./helpers/fakePayload";

const NOW = new Date("2026-10-01T00:00:00.000Z");
const IN_A_YEAR = "2027-10-01T00:00:00.000Z";
const IN_TWO_YEARS = "2028-10-01T00:00:00.000Z";
const YESTERDAY = "2026-09-30T00:00:00.000Z";

function seed(requests: Record<string, unknown>[] = []) {
	return fakePayload({
		users: [
			{ id: "u-1", role: "user", name: "Aïcha" },
			{ id: "u-2", role: "user", name: "Autre" },
		],
		shops: [
			{
				id: "s-1",
				handle: "akwa",
				name: "Akwa",
				owner: "u-1",
				status: "active",
				level: 1,
			},
		],
		"verification-requests": requests,
		"moderation-log": [],
	});
}

const req = (payload: ReturnType<typeof seed>) =>
	({ payload, context: {}, user: null }) as never;
const shop = (p: ReturnType<typeof seed>) =>
	p.store.shops.find((s) => s.id === "s-1");

const approved = (over: Record<string, unknown>) => ({
	id: "vr-1",
	shop: "s-1",
	submittedBy: "u-1",
	requestedLevel: 2,
	status: "approved",
	expiresAt: IN_TWO_YEARS,
	...over,
});

beforeEach(() => {
	__resetShopLevelListeners();
});

describe("recomputeShopLevel", () => {
	it("keeps an active shop at level 1 with no approved request", async () => {
		const payload = seed();
		expect(await recomputeShopLevel(req(payload), "s-1", "manual")).toBeNull();
		expect(shop(payload)).toMatchObject({ level: 1, levelExpiresAt: null });
	});

	it("raises to level 2 on an approved, unexpired level-2 request", async () => {
		const payload = seed([approved({})]);
		const change = await recomputeShopLevel(req(payload), "s-1", "approved");
		expect(change).toMatchObject({
			shopId: "s-1",
			previousLevel: 1,
			level: 2,
			cause: "approved",
		});
		expect(shop(payload)).toMatchObject({
			level: 2,
			levelExpiresAt: IN_TWO_YEARS,
		});
		expect(shop(payload)?.verifiedAt).toBeTruthy();
	});

	it("stays at 1 when a level-3 request is approved without level 2", async () => {
		const payload = seed([approved({ id: "vr-3", requestedLevel: 3 })]);
		await recomputeShopLevel(req(payload), "s-1", "approved");
		expect(shop(payload)?.level).toBe(1);
	});

	it("reaches level 3 only with both, and takes the earlier expiry", async () => {
		const payload = seed([
			approved({ id: "vr-2", requestedLevel: 2, expiresAt: IN_A_YEAR }),
			approved({ id: "vr-3", requestedLevel: 3, expiresAt: IN_TWO_YEARS }),
		]);
		await recomputeShopLevel(req(payload), "s-1", "approved");
		expect(shop(payload)).toMatchObject({
			level: 3,
			levelExpiresAt: IN_A_YEAR,
		});
	});

	it("does not count a request submitted by someone who is no longer the owner", async () => {
		const payload = seed([approved({ submittedBy: "u-2" })]);
		await recomputeShopLevel(req(payload), "s-1", "owner_changed");
		expect(shop(payload)?.level).toBe(1);
	});

	it("does not count an expired approval, and drops the shop back", async () => {
		const payload = seed([approved({ expiresAt: YESTERDAY })]);
		payload.store.shops[0].level = 2;
		payload.store.shops[0].levelExpiresAt = YESTERDAY;
		const change = await recomputeShopLevel(
			req(payload),
			"s-1",
			"expired",
			NOW,
		);
		expect(change).toMatchObject({ previousLevel: 2, level: 1 });
		expect(shop(payload)).toMatchObject({ level: 1, levelExpiresAt: null });
	});

	it("keeps verifiedAt once it is set, even when the level later drops", async () => {
		const payload = seed([approved({})]);
		await recomputeShopLevel(req(payload), "s-1", "approved");
		const first = shop(payload)?.verifiedAt;
		payload.store["verification-requests"][0].status = "revoked";
		await recomputeShopLevel(req(payload), "s-1", "revoked");
		expect(shop(payload)).toMatchObject({ level: 1, verifiedAt: first });
	});

	it("gives every capability nothing while the shop is suspended, without changing the stored level", async () => {
		const payload = seed([approved({})]);
		await recomputeShopLevel(req(payload), "s-1", "approved");
		payload.store.shops[0].status = "suspended";
		await recomputeShopLevel(req(payload), "s-1", "manual");
		expect(shop(payload)?.level).toBe(2);
	});

	// C1: the level-3 stamp cannot outlive the level that earned it — a
	// revoked or expired level-3 backing must clear `legal.verifiedAt` in the
	// same write as the level drop, not leave it for a later job.
	it("clears legal.verifiedAt in the same write as a level drop below 3, keeping the declared fields", async () => {
		const payload = seed([
			approved({ id: "vr-2", requestedLevel: 2 }),
			approved({ id: "vr-3", requestedLevel: 3 }),
		]);
		payload.store.shops[0].legal = {
			businessType: "company",
			legalName: "Akwa Tech SARL",
			rccmNumber: "RC/DLA/2020/B/1234",
			niu: "M012312345678N",
			verifiedAt: "2026-01-01T00:00:00.000Z",
		};
		await recomputeShopLevel(req(payload), "s-1", "approved");
		expect(shop(payload)?.level).toBe(3);

		payload.store["verification-requests"].find(
			(r) => r.id === "vr-3",
		)!.status = "revoked";
		await recomputeShopLevel(req(payload), "s-1", "revoked");

		expect(shop(payload)?.level).toBe(2);
		expect(shop(payload)?.legal).toMatchObject({
			legalName: "Akwa Tech SARL",
			rccmNumber: "RC/DLA/2020/B/1234",
			verifiedAt: null,
		});
	});

	it("leaves legal untouched when the shop was never stamped", async () => {
		const payload = seed([approved({})]);
		await recomputeShopLevel(req(payload), "s-1", "approved");
		expect(shop(payload)?.legal).toBeUndefined();
	});
});

describe("onShopLevelChanged", () => {
	it("fires once per change, with the previous and the new level", async () => {
		const listener = vi.fn();
		onShopLevelChanged(listener);
		const payload = seed([approved({})]);
		await recomputeShopLevel(req(payload), "s-1", "approved");
		expect(listener).toHaveBeenCalledTimes(1);
		expect(listener.mock.calls[0][1]).toMatchObject({
			shopId: "s-1",
			previousLevel: 1,
			level: 2,
			cause: "approved",
		});
	});

	it("does not fire when the level is unchanged", async () => {
		const listener = vi.fn();
		onShopLevelChanged(listener);
		const payload = seed();
		await recomputeShopLevel(req(payload), "s-1", "manual");
		expect(listener).not.toHaveBeenCalled();
	});

	it("lets one listener's failure through without stopping the others or the transition", async () => {
		const bad = vi.fn(() => {
			throw new Error("P4 exploded");
		});
		const good = vi.fn();
		onShopLevelChanged(bad);
		onShopLevelChanged(good);
		const payload = seed([approved({})]);
		await expect(
			recomputeShopLevel(req(payload), "s-1", "approved"),
		).resolves.toMatchObject({ level: 2 });
		expect(good).toHaveBeenCalledTimes(1);
	});
});
