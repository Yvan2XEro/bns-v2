import { describe, expect, test } from "bun:test";
import type { MyShopsEntry, TeamMemberView, TeamView } from "../types/api";
import {
	ACTIVE_SHOP_STORAGE_KEY,
	assignableMembers,
	resolveActiveShop,
} from "./activeShop";

const CAPABILITIES: MyShopsEntry["capabilities"] = {
	effectiveLevel: 1,
	badge: null,
	codOrders: false,
	protectedPayment: false,
	teamMembers: true,
	maxMembers: 5,
	supplier: false,
	fasterPayouts: false,
	legalInfoVerified: false,
};

function shop(overrides: Partial<MyShopsEntry> = {}): MyShopsEntry {
	return {
		shopId: "shop-1",
		name: "Shop One",
		handle: "shop-one",
		logoUrl: null,
		role: "owner",
		capabilities: CAPABILITIES,
		inboxUnread: 0,
		...overrides,
	};
}

function member(overrides: Partial<TeamMemberView> = {}): TeamMemberView {
	return {
		id: "member-1",
		userId: "user-1",
		name: "Member One",
		avatarUrl: null,
		role: "staff",
		joinedAt: null,
		suspended: false,
		...overrides,
	};
}

function team(members: TeamMemberView[]): TeamView {
	return {
		members,
		invitations: [],
		activeCount: members.length,
		maxMembers: 5,
		teamMembers: true,
	};
}

describe("ACTIVE_SHOP_STORAGE_KEY", () => {
	test("names the AsyncStorage key the seller space reads", () => {
		expect(ACTIVE_SHOP_STORAGE_KEY).toBe("bns.activeShopId");
	});
});

describe("resolveActiveShop", () => {
	test("picks the stored shop when the caller still belongs to it", () => {
		const shops = [shop({ shopId: "shop-1" }), shop({ shopId: "shop-2" })];
		expect(resolveActiveShop(shops, "shop-2")?.shopId).toBe("shop-2");
	});

	test("falls back to the first shop when the stored id matches nothing", () => {
		const shops = [shop({ shopId: "shop-1" }), shop({ shopId: "shop-2" })];
		expect(resolveActiveShop(shops, "shop-9")?.shopId).toBe("shop-1");
	});

	test("falls back to the first shop when nothing is stored", () => {
		const shops = [shop({ shopId: "shop-1" }), shop({ shopId: "shop-2" })];
		expect(resolveActiveShop(shops, null)?.shopId).toBe("shop-1");
	});

	test("returns null when the caller belongs to no shop", () => {
		expect(resolveActiveShop([], "shop-1")).toBeNull();
	});
});

describe("assignableMembers", () => {
	test("returns every active member for a caller who can assign others", () => {
		const t = team([
			member({ id: "m1", userId: "owner", role: "owner" }),
			member({ id: "m2", userId: "staff-1", role: "staff" }),
			member({ id: "m3", userId: "staff-2", role: "staff", suspended: true }),
		]);
		const result = assignableMembers(t, "owner", "owner");
		expect(result.map((m) => m.userId)).toEqual(["owner", "staff-1"]);
	});

	test("excludes a suspended member even for a caller who can assign others", () => {
		const t = team([
			member({ id: "m1", userId: "owner", role: "owner" }),
			member({ id: "m2", userId: "staff-1", role: "staff", suspended: true }),
		]);
		const result = assignableMembers(t, "owner", "owner");
		expect(result.some((m) => m.userId === "staff-1")).toBe(false);
	});

	test("returns only the caller for a staff member, never the member list", () => {
		const t = team([
			member({ id: "m1", userId: "owner", role: "owner" }),
			member({ id: "m2", userId: "staff-1", role: "staff" }),
		]);
		const result = assignableMembers(t, "staff", "staff-1");
		expect(result.map((m) => m.userId)).toEqual(["staff-1"]);
	});

	test("returns nothing for a staff member who is themselves suspended", () => {
		const t = team([
			member({ id: "m2", userId: "staff-1", role: "staff", suspended: true }),
		]);
		expect(assignableMembers(t, "staff", "staff-1")).toEqual([]);
	});

	test("returns an empty list when the team has not loaded yet", () => {
		expect(assignableMembers(undefined, "owner", "owner")).toEqual([]);
	});
});
