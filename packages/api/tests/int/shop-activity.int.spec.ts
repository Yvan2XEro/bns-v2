import { describe, expect, it } from "vitest";
import { ShopActivityLog } from "../../src/collections/ShopActivityLog";
import {
	ACTIVITY_PAGE_SIZE,
	listShopActivity,
	recentShopActivity,
	recordShopActivity,
} from "../../src/services/shopActivity";
import { fakePayload } from "./helpers/fakePayload";

function seed(entries: Record<string, unknown>[] = []) {
	return fakePayload({
		users: [
			{ id: "u-owner", role: "user", name: "Aicha" },
			{ id: "u-staff", role: "user", name: "Bruno" },
		],
		shops: [
			{
				id: "s-1",
				handle: "akwa",
				name: "Akwa",
				owner: "u-owner",
				status: "active",
				level: 2,
				levelExpiresAt: null,
			},
		],
		"shop-members": [
			{
				id: "m-owner",
				shop: "s-1",
				user: "u-owner",
				role: "owner",
				status: "active",
			},
			{
				id: "m-staff",
				shop: "s-1",
				user: "u-staff",
				role: "staff",
				status: "active",
			},
		],
		"shop-activity-log": entries,
	});
}

const req = (payload: ReturnType<typeof seed>) =>
	({ payload, context: {}, user: null }) as never;

/** One cast, reused by every `access.read` call below rather than one per test. */
const accessArgs = (
	payload: ReturnType<typeof seed>,
	userId: string,
	role = "user",
) =>
	({
		req: { user: { id: userId, role }, payload, context: {} },
	}) as never;
const actor = (id: string) => ({
	id,
	role: "user",
	name: null,
	suspendedAt: null,
	suspendedUntil: null,
});

describe("recordShopActivity", () => {
	it("appends one entry with the actor, the snapshot role and the metadata", async () => {
		const payload = seed();
		await recordShopActivity(req(payload), {
			shop: "s-1",
			actor: "u-owner",
			actorRole: "owner",
			action: "member.invited",
			targetType: "invitation",
			targetId: "inv-1",
			metadata: { role: "staff", channel: "phone" },
		});
		expect(payload.store["shop-activity-log"]).toHaveLength(1);
		expect(payload.store["shop-activity-log"][0]).toMatchObject({
			shop: "s-1",
			actor: "u-owner",
			actorRole: "owner",
			action: "member.invited",
			targetType: "invitation",
			targetId: "inv-1",
			metadata: { role: "staff", channel: "phone" },
		});
	});

	it("records a system entry with no actor", async () => {
		const payload = seed();
		await recordShopActivity(req(payload), {
			shop: "s-1",
			actor: null,
			actorRole: "system",
			action: "member.paused",
			targetType: "member",
			targetId: "m-staff",
		});
		expect(payload.store["shop-activity-log"][0]).toMatchObject({
			actor: null,
			actorRole: "system",
		});
	});

	it("joins the caller's transaction so a rollback undoes the entry", async () => {
		const payload = seed();
		// `payload.db` is typed as `Payload["db"] & typeof localDb`; narrowed back
		// to the fake's own shape so `beginTransaction`/`rollbackTransaction` keep
		// the string ids the fake actually returns, rather than the real
		// adapter's wider `string | number | Promise<...>` signature.
		const db = payload.db as unknown as {
			beginTransaction: () => Promise<string>;
			rollbackTransaction: (id: string) => Promise<void>;
		};
		const txId = await db.beginTransaction();
		const txReq = {
			payload,
			context: {},
			transactionID: txId,
			user: null,
		} as never;
		await recordShopActivity(txReq, {
			shop: "s-1",
			actor: "u-owner",
			actorRole: "owner",
			action: "shop.updated",
			targetType: "shop",
			targetId: "s-1",
		});
		await db.rollbackTransaction(txId);
		expect(payload.store["shop-activity-log"]).toHaveLength(0);
	});
});

describe("the cost-metadata rule", () => {
	it("refuses a cost field in metadata on any action but variant.cost_changed", async () => {
		const payload = seed();
		await expect(
			recordShopActivity(req(payload), {
				shop: "s-1",
				actor: "u-owner",
				actorRole: "owner",
				action: "variant.price_changed",
				targetType: "variant",
				targetId: "v-1",
				metadata: { price: 1200, cost: 400 },
			}),
		).rejects.toThrow(/cost/i);
		expect(payload.store["shop-activity-log"]).toHaveLength(0);
	});

	it("refuses a differently-cased or -named cost field too", async () => {
		const payload = seed();
		await expect(
			recordShopActivity(req(payload), {
				shop: "s-1",
				actor: "u-owner",
				actorRole: "owner",
				action: "stock.moved",
				targetType: "variant",
				targetId: "v-1",
				metadata: { quantity: 5, unitCost: 400 },
			}),
		).rejects.toThrow(/cost/i);
		expect(payload.store["shop-activity-log"]).toHaveLength(0);
	});

	it("allows a cost field when the action is variant.cost_changed", async () => {
		const payload = seed();
		await recordShopActivity(req(payload), {
			shop: "s-1",
			actor: "u-owner",
			actorRole: "owner",
			action: "variant.cost_changed",
			targetType: "variant",
			targetId: "v-1",
			metadata: { costBefore: 400, costAfter: 450 },
		});
		expect(payload.store["shop-activity-log"][0]).toMatchObject({
			metadata: { costBefore: 400, costAfter: 450 },
		});
	});
});

describe("the collection's own read access gates on activity.view", () => {
	it("scopes to shops where the caller's role holds activity.view", async () => {
		const payload = seed();
		// Owner holds activity.view: scoped to the shops that permission covers.
		expect(
			await ShopActivityLog.access?.read?.(accessArgs(payload, "u-owner")),
		).toEqual({
			shop: { in: ["s-1"] },
		});
		// Staff is an active member but activity.view is not in its grant, so
		// the scope excludes every shop rather than falling back to membership.
		expect(
			await ShopActivityLog.access?.read?.(accessArgs(payload, "u-staff")),
		).toEqual({
			shop: { in: [] },
		});
	});
});

describe("a moderator reading the collection directly (I5)", () => {
	it("does not get the bare access that also reaches variant.cost_changed metadata", async () => {
		const payload = seed();
		// The moderation shop-sheet route strips cost metadata by hand for its
		// own reader; a moderator hitting the collection directly must not be
		// able to walk around that by getting the bare `true` the row-level
		// short-circuit used to return regardless of the row's content.
		expect(
			await ShopActivityLog.access?.read?.(
				accessArgs(payload, "u-mod", "moderator"),
			),
		).toEqual({
			action: { not_equals: "variant.cost_changed" },
		});
	});
});

describe("the collection is append-only through requests", () => {
	it("refuses create, update and delete to everyone, admin included", () => {
		const admin = { req: { user: { id: "u-admin", role: "admin" } } } as never;
		expect(ShopActivityLog.access?.create?.(admin)).toBe(false);
		expect(ShopActivityLog.access?.update?.(admin)).toBe(false);
		expect(ShopActivityLog.access?.delete?.(admin)).toBe(false);
	});
});

describe("listShopActivity", () => {
	const entry = (id: string, over: Record<string, unknown> = {}) => ({
		id,
		shop: "s-1",
		actor: "u-owner",
		actorRole: "owner",
		action: "product.updated",
		targetType: "product",
		targetId: "p-1",
		metadata: null,
		createdAt: `2026-09-${id.slice(-2)}T00:00:00.000Z`,
		...over,
	});

	it("refuses a staff member, who does not hold activity.view", async () => {
		const payload = seed([entry("a-01")]);
		await expect(
			listShopActivity(payload, actor("u-staff"), "s-1"),
		).rejects.toMatchObject({ code: "shop.forbidden", status: 403 });
	});

	it("returns the newest first and hydrates the actor's name", async () => {
		const payload = seed([entry("a-01"), entry("a-03"), entry("a-02")]);
		const page = await listShopActivity(payload, actor("u-owner"), "s-1");
		expect(page.docs.map((d) => d.id)).toEqual(["a-03", "a-02", "a-01"]);
		expect(page.docs[0].actor).toEqual({ id: "u-owner", name: "Aicha" });
	});

	it("filters by actor, action and target type", async () => {
		const payload = seed([
			entry("a-01", {
				actor: "u-staff",
				actorRole: "staff",
				action: "stock.moved",
				targetType: "variant",
			}),
			entry("a-02"),
		]);
		expect(
			(
				await listShopActivity(payload, actor("u-owner"), "s-1", {
					actor: "u-staff",
				})
			).docs.map((d) => d.id),
		).toEqual(["a-01"]);
		expect(
			(
				await listShopActivity(payload, actor("u-owner"), "s-1", {
					action: "stock.moved",
				})
			).docs.map((d) => d.id),
		).toEqual(["a-01"]);
		expect(
			(
				await listShopActivity(payload, actor("u-owner"), "s-1", {
					targetType: "product",
				})
			).docs.map((d) => d.id),
		).toEqual(["a-02"]);
	});

	it("pages 50 at a time and hands back a cursor", async () => {
		const many = Array.from({ length: 60 }, (_, i) =>
			entry(`a-${String(i + 1).padStart(2, "0")}`, {
				createdAt: new Date(Date.UTC(2026, 8, 1, 0, i)).toISOString(),
			}),
		);
		const payload = seed(many);
		const first = await listShopActivity(payload, actor("u-owner"), "s-1");
		expect(first.docs).toHaveLength(ACTIVITY_PAGE_SIZE);
		expect(first.nextCursor).toBe(first.docs[ACTIVITY_PAGE_SIZE - 1].createdAt);
		const second = await listShopActivity(payload, actor("u-owner"), "s-1", {
			cursor: first.nextCursor ?? undefined,
		});
		expect(second.docs).toHaveLength(10);
		expect(second.nextCursor).toBeNull();
		expect(second.docs.map((d) => d.id)).not.toContain(first.docs[0].id);
	});

	it("never shows another shop's entries", async () => {
		const payload = seed([entry("a-01"), entry("a-02", { shop: "s-2" })]);
		const page = await listShopActivity(payload, actor("u-owner"), "s-1");
		expect(page.docs.map((d) => d.id)).toEqual(["a-01"]);
	});
});

describe("recentShopActivity", () => {
	it("returns at most the requested number, newest first, with no permission check", async () => {
		const payload = seed(
			Array.from({ length: 25 }, (_, i) => ({
				id: `a-${i}`,
				shop: "s-1",
				actor: "u-owner",
				actorRole: "owner",
				action: "product.updated",
				targetType: "product",
				targetId: "p-1",
				metadata: null,
				createdAt: new Date(Date.UTC(2026, 8, 1, 0, i)).toISOString(),
			})),
		);
		const rows = await recentShopActivity(payload, "s-1", 20);
		expect(rows).toHaveLength(20);
		expect(rows[0].id).toBe("a-24");
	});
});
