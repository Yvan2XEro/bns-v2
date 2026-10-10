import { describe, expect, it } from "bun:test";
import { activeNavKey, SELLER_NAV, visibleSellerNav } from "./seller-nav";

const keys = (entries: { key: string }[]) => entries.map((entry) => entry.key);

describe("visibleSellerNav", () => {
	it("gives an owner the order entries when ordering is on", () => {
		const nav = keys(visibleSellerNav("owner", true));
		expect(
			nav.filter((key) => ["orders", "returns", "disputes"].includes(key)),
		).toEqual(["orders", "returns", "disputes"]);
	});

	it("hides every order entry when ordering is off, and nothing else", () => {
		const on = keys(visibleSellerNav("owner", true, false, false, true));
		const off = keys(visibleSellerNav("owner", false, false, false, true));
		// Protected payment is off here, so the hub rides the ordersEnabled leg.
		expect(on.filter((key) => !off.includes(key))).toEqual([
			"orders",
			"disputes",
			"delivery",
			"payments",
		]);
		expect(off).toContain("returns");
	});

	it("gives staff the orders list but not the payments hub", () => {
		const nav = keys(visibleSellerNav("staff", true, true));
		expect(nav).toContain("orders");
		expect(nav).not.toContain("payments");
	});

	it("shows the disputes queue to order viewers only when ordering is enabled", () => {
		expect(keys(visibleSellerNav("owner", true))).toContain("disputes");
		expect(keys(visibleSellerNav("staff", true))).toContain("disputes");
		expect(keys(visibleSellerNav("owner", false))).not.toContain("disputes");
		expect(keys(visibleSellerNav(null, true))).not.toContain("disputes");
	});

	// Spec 2: personal chat is a buyer-hat task reached via "Revenir en mode
	// acheteur" — the /messages entry is removed, so a role-less member now
	// sees the dashboard alone.
	it("leaves a member with no usable role only the dashboard", () => {
		expect(keys(visibleSellerNav(null, true))).toEqual(["dashboard"]);
	});

	// Spec 5: activity, billing and orderSettings are absorbed tabs, never
	// sidebar entries, whatever the role or flags.
	it("never lists an absorbed page or the public chat as an entry", () => {
		for (const nav of [
			keys(visibleSellerNav("owner", true, true, true, true)),
			keys(visibleSellerNav("owner", false)),
		]) {
			expect(nav).not.toContain("messages");
			expect(nav).not.toContain("activity");
			expect(nav).not.toContain("billing");
			expect(nav).not.toContain("orderSettings");
		}
	});

	// Decision 4: one Payments hub — visible to payments.view holders when
	// EITHER surface exists (protected payouts flag, or the ordersEnabled
	// commission family), hidden when both are off.
	it("shows the payments hub on either flag and hides it on neither", () => {
		expect(keys(visibleSellerNav("owner", true, false))).toContain("payments");
		expect(keys(visibleSellerNav("owner", false, true))).toContain("payments");
		expect(keys(visibleSellerNav("owner", false, false))).not.toContain(
			"payments",
		);
		expect(keys(visibleSellerNav("staff", true, true))).not.toContain(
			"payments",
		);
	});

	// Spec 5: absorbed tabs light their parent entry.
	it("maps absorbed pathnames to their owning entry", () => {
		expect(activeNavKey("/seller")).toBe("dashboard");
		expect(activeNavKey("/seller/insights")).toBe("dashboard"); // Decision 3
		expect(activeNavKey("/seller/billing/abc")).toBe("payments"); // Decision 4
		expect(activeNavKey("/seller/team/activity")).toBe("team");
		expect(activeNavKey("/seller/settings")).toBe("settings"); // via the entry itself
		expect(activeNavKey("/seller/settings/orders")).toBe("settings");
		expect(activeNavKey("/seller/resale/links")).toBe("resale");
		expect(activeNavKey("/messages")).toBeNull();
	});

	it("shows resale orders only when enabled and the member can manage resale", () => {
		expect(keys(visibleSellerNav("staff", true, false, false))).not.toContain(
			"resale",
		);
		expect(keys(visibleSellerNav("staff", true, false, true))).not.toContain(
			"resale",
		);
		expect(keys(visibleSellerNav("owner", true, false, true))).toContain(
			"resale",
		);
		expect(keys(visibleSellerNav("manager", true, false, true))).toContain(
			"resale",
		);
		expect(keys(visibleSellerNav("staff", false, false, true))).not.toContain(
			"resale",
		);
	});

	it("shows delivery to settings editors only while the zones flag is on", () => {
		expect(keys(visibleSellerNav("owner", true))).not.toContain("delivery");
		expect(keys(visibleSellerNav("owner", true, false, false, true))).toContain(
			"delivery",
		);
		expect(
			keys(visibleSellerNav("manager", true, false, false, true)),
		).toContain("delivery");
		expect(
			keys(visibleSellerNav("staff", true, false, false, true)),
		).not.toContain("delivery");
	});
});

// Decision 2: the old URL survives only as the permanent 308 in redirects.ts.
describe("the settings entry", () => {
	it("points into the workspace, never at /shop/manage", () => {
		expect(SELLER_NAV.some((e) => e.href.startsWith("/shop/manage"))).toBe(
			false,
		);
	});
});
