import { describe, expect, test } from "bun:test";
import {
	dashboardTasks,
	ordersToHandle,
	parseStoredMode,
	resolveAppMode,
} from "./appMode";

describe("parseStoredMode", () => {
	test("only an explicit seller value opens seller mode", () => {
		expect(parseStoredMode("seller")).toBe("seller");
		expect(parseStoredMode("buyer")).toBe("buyer");
		expect(parseStoredMode(null)).toBe("buyer");
		expect(parseStoredMode("garbage")).toBe("buyer");
	});
});

describe("resolveAppMode", () => {
	const member = { signedIn: true, loading: false, shopCount: 1 };

	test("buyer mode never needs the memberships", () => {
		expect(resolveAppMode("buyer", { ...member, loading: true })).toBe("buyer");
	});

	test("a member stays in seller mode", () => {
		expect(resolveAppMode("seller", member)).toBe("seller");
	});

	test("waits while the memberships load", () => {
		expect(resolveAppMode("seller", { ...member, loading: true })).toBe(
			"pending",
		);
	});

	test("falls back to buyer mode once the last membership is gone", () => {
		expect(resolveAppMode("seller", { ...member, shopCount: 0 })).toBe("buyer");
	});

	test("falls back to buyer mode when signed out", () => {
		expect(resolveAppMode("seller", { ...member, signedIn: false })).toBe(
			"buyer",
		);
	});
});

describe("ordersToHandle", () => {
	test("adds the orders to accept and to ship", () => {
		expect(ordersToHandle({ to_accept: 3, to_ship: 2 })).toBe(5);
		expect(ordersToHandle(undefined)).toBe(0);
	});
});

describe("dashboardTasks", () => {
	test("keeps the urgent order and drops what is already handled", () => {
		expect(
			dashboardTasks({
				toAccept: 3,
				toShip: 0,
				unread: 1,
				lowStock: 2,
				paymentsHolds: 0,
			}),
		).toEqual([
			{ key: "toAccept", count: 3 },
			{ key: "unread", count: 1 },
			{ key: "lowStock", count: 2 },
		]);
	});
});
