import { describe, expect, test } from "bun:test";
import type { MyShopsEntry, TeamMemberView, TeamView } from "~/types";
import {
	ACTIVE_SHOP_COOKIE,
	assignableMembers,
	myShopPath,
	readActiveShopCookie,
	resolveActiveShop,
	switchShopTarget,
} from "./active-shop";

const shop = (id: string): MyShopsEntry => ({
	shopId: id,
	name: id,
	handle: id,
	logoUrl: null,
	role: "staff",
	capabilities: {
		effectiveLevel: 2,
		badge: "identity",
		codOrders: true,
		protectedPayment: true,
		teamMembers: true,
		maxMembers: 5,
		supplier: false,
		fasterPayouts: false,
		legalInfoVerified: false,
	},
	inboxUnread: 0,
});

describe("resolveActiveShop", () => {
	test("names the cookie the seller space reads", () => {
		expect(ACTIVE_SHOP_COOKIE).toBe("bns_active_shop");
	});

	test("picks the cookie's shop when the caller still belongs to it", () => {
		expect(resolveActiveShop([shop("s-1"), shop("s-2")], "s-2")?.shopId).toBe(
			"s-2",
		);
	});

	test("falls back to the first shop when the cookie names one they left", () => {
		expect(resolveActiveShop([shop("s-1")], "s-9")?.shopId).toBe("s-1");
	});

	test("falls back to the first shop when there is no cookie", () => {
		expect(resolveActiveShop([shop("s-1")], null)?.shopId).toBe("s-1");
	});

	test("returns null when the caller belongs to nothing", () => {
		expect(resolveActiveShop([], "s-1")).toBeNull();
	});
});

describe("assignableMembers", () => {
	const member = (over: Partial<TeamMemberView>): TeamMemberView => ({
		id: "m-1",
		userId: "u-1",
		name: "Bruno",
		avatarUrl: null,
		role: "staff",
		joinedAt: null,
		suspended: false,
		...over,
	});

	const team = (members: TeamMemberView[]): TeamView => ({
		members,
		invitations: [],
		activeCount: members.length,
		maxMembers: 5,
		teamMembers: true,
	});

	test("a manager may pick anyone who is not suspended", () => {
		const members = [
			member({ id: "m-o", userId: "u-owner", role: "owner" }),
			member({ id: "m-s", userId: "u-staff" }),
			member({ id: "m-x", userId: "u-susp", suspended: true }),
		];
		expect(
			assignableMembers(team(members), "manager", "u-mgr").map((m) => m.userId),
		).toEqual(["u-owner", "u-staff"]);
	});

	test("a staff member may only pick themselves", () => {
		const members = [
			member({ id: "m-o", userId: "u-owner", role: "owner" }),
			member({ id: "m-s", userId: "u-staff" }),
		];
		expect(
			assignableMembers(team(members), "staff", "u-staff").map((m) => m.userId),
		).toEqual(["u-staff"]);
	});

	test("an undefined team is an empty list, not a crash", () => {
		expect(assignableMembers(undefined, "manager", "u-mgr")).toEqual([]);
	});
});

describe("shop switching (W22)", () => {
	test("asks the API for the preferred shop", () => {
		expect(myShopPath(null)).toBe("/api/shops/mine");
		expect(myShopPath("s 2")).toBe("/api/shops/mine?shopId=s%202");
	});

	test("reads the switcher cookie among others", () => {
		expect(readActiveShopCookie("a=1; bns_active_shop=s-2; b=3")).toBe("s-2");
		expect(readActiveShopCookie("a=1")).toBeNull();
		expect(readActiveShopCookie("")).toBeNull();
		expect(readActiveShopCookie("bns_active_shop=%E0%A4")).toBeNull();
	});

	test("stays on the same page when it holds no record of the old shop", () => {
		expect(switchShopTarget("/seller")).toBe("/seller");
		expect(switchShopTarget("/seller/orders")).toBe("/seller/orders");
		expect(switchShopTarget("/seller/stock/inventory")).toBe(
			"/seller/stock/inventory",
		);
		expect(switchShopTarget("/seller/catalogue/new")).toBe(
			"/seller/catalogue/new",
		);
	});

	test("leaves a record page for its section", () => {
		expect(switchShopTarget("/seller/orders/abc")).toBe("/seller/orders");
		expect(switchShopTarget("/seller/catalogue/p1")).toBe("/seller/catalogue");
		expect(switchShopTarget("/seller/payments/payouts/x")).toBe(
			"/seller/payments",
		);
		expect(switchShopTarget("/seller/resale/products/x")).toBe(
			"/seller/resale",
		);
		expect(switchShopTarget("/seller/verification/identity/return")).toBe(
			"/seller/verification",
		);
	});

	test("anything outside the seller space lands on its home", () => {
		expect(switchShopTarget("/s/akwa")).toBe("/seller");
	});
});
