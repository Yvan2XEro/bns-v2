import { describe, expect, test } from "bun:test";
import en from "~/../messages/en.json";
import fr from "~/../messages/fr.json";
import {
	canActOnShop,
	canReleaseHold,
	HOLD_REASON_LABELS,
	holdBody,
	lastLiftedAt,
	PAYOUT_ORIGIN_LABELS,
	parseShopFilters,
	personLabel,
	SHOP_STATUS_LABELS,
	SUSPENSION_REASON_LABELS,
	shopLogHref,
	shopsHref,
	shopsPath,
	suspendBody,
	suspensionDurations,
	unsuspendBody,
	withNote,
} from "./moderation-shops";

type Json = { [key: string]: Json | string };
const leaf = (root: Json, path: string) =>
	path
		.split(".")
		.reduce<Json | string | undefined>(
			(node, key) => (node && typeof node === "object" ? node[key] : undefined),
			root,
		);

const params = (search: string) => new URLSearchParams(search);

describe("shop labels", () => {
	test("every label resolves in both locales", () => {
		for (const key of [
			...Object.values(SHOP_STATUS_LABELS),
			...Object.values(SUSPENSION_REASON_LABELS),
			...Object.values(HOLD_REASON_LABELS),
			...Object.values(PAYOUT_ORIGIN_LABELS),
			"shop.restriction.codCapHalved",
			"shop.restriction.protectedCapHalved",
			"shop.restriction.protectedUnavailable",
		]) {
			expect(typeof leaf(en as Json, `ModerationConsole.${key}`)).toBe(
				"string",
			);
			expect(typeof leaf(fr as Json, `ModerationConsole.${key}`)).toBe(
				"string",
			);
		}
	});
});

describe("shop filters", () => {
	test("reads q and a known status, drops the rest", () => {
		expect(parseShopFilters(params("q=%20akwa%20&status=suspended"))).toEqual({
			q: "akwa",
			status: "suspended",
		});
		expect(parseShopFilters(params("status=deleted"))).toEqual({
			q: undefined,
			status: undefined,
		});
	});

	test("hrefs and API paths carry only the set filters", () => {
		expect(shopsHref("/moderation/shops", {})).toBe("/moderation/shops");
		expect(
			shopsHref("/moderation/shops", { q: "kana", status: "active" }),
		).toBe("/moderation/shops?q=kana&status=active");
		expect(shopsPath({ q: "kana" }, "2")).toBe(
			"/api/moderation/shops?q=kana&cursor=2",
		);
		expect(shopLogHref("s1")).toBe(
			"/moderation/log?targetType=shop&targetId=s1",
		);
	});
});

describe("who may act on a shop", () => {
	const owner = { id: "u1", role: "user" };
	test("a moderator outranks an ordinary owner, not another moderator", () => {
		expect(canActOnShop({ id: "m1", role: "moderator" }, owner)).toBe(true);
		expect(
			canActOnShop(
				{ id: "m1", role: "moderator" },
				{ id: "m2", role: "moderator" },
			),
		).toBe(false);
		expect(
			canActOnShop(
				{ id: "a1", role: "admin" },
				{ id: "m2", role: "moderator" },
			),
		).toBe(true);
	});
	test("nobody sanctions their own shop, and a plain user sanctions nothing", () => {
		expect(
			canActOnShop({ id: "u1", role: "admin" }, { id: "u1", role: "user" }),
		).toBe(false);
		expect(canActOnShop({ id: "u2", role: "user" }, owner)).toBe(false);
		expect(canActOnShop(null, owner)).toBe(false);
		expect(canActOnShop({ id: "m1", role: "moderator" }, null)).toBe(false);
	});
});

describe("suspension bodies", () => {
	test("a moderator's durations stop at 30 days; an administrator's include until lifted", () => {
		expect(suspensionDurations(false)).toEqual([1, 7, 30]);
		expect(suspensionDurations(true)).toEqual([1, 7, 30, null]);
	});

	test("a suspension needs a known reason and an allowed duration", () => {
		expect(
			suspendBody({
				reason: "fraud",
				durationDays: 7,
				note: "  repeat  ",
				isAdmin: false,
			}),
		).toEqual({
			action: "suspend",
			reason: "fraud",
			durationDays: 7,
			note: "repeat",
		});
		expect(
			suspendBody({ reason: "", durationDays: 7, note: "", isAdmin: false }),
		).toBeNull();
		expect(
			suspendBody({
				reason: "fraud",
				durationDays: null,
				note: "",
				isAdmin: false,
			}),
		).toBeNull();
		expect(
			suspendBody({
				reason: "fraud",
				durationDays: null,
				note: "",
				isAdmin: true,
			}),
		).toEqual({ action: "suspend", reason: "fraud", durationDays: null });
		expect(
			suspendBody({
				reason: "spam",
				durationDays: 1,
				note: "x".repeat(1001),
				isAdmin: true,
			}),
		).toBeNull();
	});

	test("lifting says whether listings come back", () => {
		expect(unsuspendBody({ restoreListings: false, note: "" })).toEqual({
			action: "unsuspend",
			restoreListings: false,
		});
		expect(unsuspendBody({ restoreListings: true, note: " ok " })).toEqual({
			action: "unsuspend",
			restoreListings: true,
			note: "ok",
		});
	});
});

describe("payout bodies", () => {
	test("a hold takes a manual reason and a listed duration", () => {
		expect(
			holdBody({ reason: "moderation", untilDays: null, note: "" }),
		).toEqual({
			action: "hold",
			scope: "shop",
			reason: "moderation",
			untilDays: null,
		});
		expect(
			holdBody({ reason: "shop_suspended", untilDays: 7, note: "" }),
		).toBeNull();
		expect(
			holdBody({ reason: "moderation", untilDays: 9, note: "" }),
		).toBeNull();
	});

	test("a hold is released by the rank the API asks for, the suspension's never", () => {
		expect(canReleaseHold("moderation", false)).toBe(true);
		expect(canReleaseHold("dispute_open", false)).toBe(true);
		expect(canReleaseHold("fraud_signal", false)).toBe(false);
		expect(canReleaseHold("fraud_signal", true)).toBe(true);
		expect(canReleaseHold("shop_suspended", true)).toBe(false);
	});

	test("a note is trimmed, dropped when empty and refused past 1,000 characters", () => {
		const body = { action: "release" as const, holdId: "h1" };
		expect(withNote(body, "  ")).toEqual(body);
		expect(withNote(body, " why ")).toEqual({ ...body, note: "why" });
		expect(withNote(body, "x".repeat(1001))).toBeNull();
	});
});

describe("sheet helpers", () => {
	test("the last lift is the newest shop.unsuspend entry", () => {
		expect(
			lastLiftedAt([
				{
					id: "1",
					action: "shop.unsuspend",
					actor: null,
					createdAt: "2026-05-01T00:00:00.000Z",
				},
				{
					id: "2",
					action: "shop.suspend",
					actor: null,
					createdAt: "2026-07-01T00:00:00.000Z",
				},
				{
					id: "3",
					action: "shop.unsuspend",
					actor: null,
					createdAt: "2026-06-23T00:00:00.000Z",
				},
			]),
		).toBe("2026-06-23T00:00:00.000Z");
		expect(lastLiftedAt([])).toBeNull();
	});

	test("a person reads by name, then email, never by bare id", () => {
		expect(personLabel({ id: "u1", name: "Awa" })).toBe("Awa");
		expect(personLabel({ id: "u1", name: null, email: "a@b.test" })).toBe(
			"a@b.test",
		);
		expect(personLabel("u1")).toBeNull();
	});
});
