import { describe, expect, it } from "bun:test";
import { visibleSellerNav } from "./seller-nav";

const keys = (entries: { key: string }[]) => entries.map((entry) => entry.key);

describe("visibleSellerNav", () => {
	it("gives an owner the three order entries when ordering is on", () => {
		const nav = keys(visibleSellerNav("owner", true));
		expect(
			nav.filter((key) => ["orders", "billing", "orderSettings"].includes(key)),
		).toEqual(["orders", "billing", "orderSettings"]);
	});

	it("hides every order entry when ordering is off, and nothing else", () => {
		const on = keys(visibleSellerNav("owner", true, false, false, true));
		const off = keys(visibleSellerNav("owner", false, false, false, true));
		expect(on.filter((key) => !off.includes(key))).toEqual([
			"orders",
			"disputes",
			"billing",
			"delivery",
			"orderSettings",
		]);
		expect(off).toContain("returns");
	});

	it("gives staff the orders list but not billing or its settings", () => {
		const nav = keys(visibleSellerNav("staff", true));
		expect(nav).toContain("orders");
		expect(nav).not.toContain("billing");
		expect(nav).not.toContain("orderSettings");
	});

	it("shows the disputes queue to order viewers only when ordering is enabled", () => {
		expect(keys(visibleSellerNav("owner", true))).toContain("disputes");
		expect(keys(visibleSellerNav("staff", true))).toContain("disputes");
		expect(keys(visibleSellerNav("owner", false))).not.toContain("disputes");
		expect(keys(visibleSellerNav(null, true))).not.toContain("disputes");
	});

	it("leaves a member with no usable role only the role-free entries", () => {
		expect(keys(visibleSellerNav(null, true))).toEqual([
			"dashboard",
			"messages",
		]);
	});

	it("hides payments when the protected-payment flag is off, flag defaulted or explicit", () => {
		expect(keys(visibleSellerNav("owner", true))).not.toContain("payments");
		expect(keys(visibleSellerNav("owner", true, false))).not.toContain(
			"payments",
		);
	});

	it("shows payments to an owner once the flag is on, billing's permission gate reused", () => {
		expect(keys(visibleSellerNav("owner", true, true))).toContain("payments");
		expect(keys(visibleSellerNav("staff", true, true))).not.toContain(
			"payments",
		);
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
