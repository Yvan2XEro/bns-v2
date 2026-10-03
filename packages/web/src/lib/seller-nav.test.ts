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
		const on = keys(visibleSellerNav("owner", true));
		const off = keys(visibleSellerNav("owner", false));
		expect(on.filter((key) => !off.includes(key))).toEqual([
			"orders",
			"billing",
			"orderSettings",
		]);
	});

	it("gives staff the orders list but not billing or its settings", () => {
		const nav = keys(visibleSellerNav("staff", true));
		expect(nav).toContain("orders");
		expect(nav).not.toContain("billing");
		expect(nav).not.toContain("orderSettings");
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
});
