import { describe, expect, test } from "bun:test";
import en from "../locales/en.json";
import fr from "../locales/fr.json";
import { orderHelpActions, shopMessageTarget } from "./orderHelpBar";

describe("orderHelpActions", () => {
	test("offers both when a problem can be reported", () => {
		expect(
			orderHelpActions({ canReportProblem: true, shopId: "shop-1" }),
		).toEqual(["report_problem", "message_shop"]);
	});

	test("drops the problem button when the order does not allow it", () => {
		expect(
			orderHelpActions({ canReportProblem: false, shopId: "shop-1" }),
		).toEqual(["message_shop"]);
	});

	test("offers nothing without a shop or a problem to report", () => {
		expect(orderHelpActions({ canReportProblem: false, shopId: null })).toEqual(
			[],
		);
	});

	test("labels exist in both locales", () => {
		expect(fr.purchases.helpProblem).toBe("Un problème ?");
		expect(fr.purchases.helpMessageShop).toBe("Écrire à la boutique");
		expect(typeof en.purchases.helpProblem).toBe("string");
		expect(typeof en.purchases.helpMessageShop).toBe("string");
	});
});

describe("shopMessageTarget", () => {
	test("opens the order's conversation when it exists", () => {
		expect(shopMessageTarget("conv-1", "shop-1")).toEqual({
			kind: "open",
			conversationId: "conv-1",
		});
	});

	test("starts a shop conversation otherwise", () => {
		expect(shopMessageTarget(null, "shop-1")).toEqual({
			kind: "start",
			shopId: "shop-1",
		});
	});
});
