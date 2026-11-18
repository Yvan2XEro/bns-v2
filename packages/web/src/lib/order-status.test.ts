import { describe, expect, test } from "bun:test";
import {
	ORDER_STATUS_LABEL_KEYS,
	ORDER_STATUSES,
	SHOP_ORDER_TABS,
	statusLabelKey,
	TAB_STATUSES,
} from "./order-status";

/**
 * The table that actually proves this copy matches the server lives in
 * `packages/api/tests/int/order-status-parity.int.spec.ts`. This file only
 * catches this copy drifting from its own internal consistency — the same
 * split `shop-roles.test.ts` makes for the permission matrix.
 */
describe("ORDER_STATUSES", () => {
	test("lists the eleven statuses in the spec's order", () => {
		expect(ORDER_STATUSES).toEqual([
			"placed",
			"confirmed",
			"paid",
			"accepted",
			"shipped",
			"delivered",
			"completed",
			"cancelled",
			"delivery_failed",
			"returned",
			"disputed",
		]);
	});
});

describe("ORDER_STATUS_LABEL_KEYS", () => {
	test("maps every status to a buyer key and a seller key", () => {
		for (const status of ORDER_STATUSES) {
			const keys = ORDER_STATUS_LABEL_KEYS[status];
			expect(typeof keys.buyer).toBe("string");
			expect(typeof keys.seller).toBe("string");
			expect(keys.buyer.length).toBeGreaterThan(0);
			expect(keys.seller.length).toBeGreaterThan(0);
		}
	});
});

describe("statusLabelKey", () => {
	test("returns the buyer or seller key from the table", () => {
		expect(statusLabelKey("shipped", "buyer")).toBe("status_shipped_buyer");
		expect(statusLabelKey("shipped", "seller")).toBe("status_shipped_seller");
	});

	test("confirmed and paid share placed's seller key", () => {
		expect(statusLabelKey("confirmed", "seller")).toBe("status_placed_seller");
		expect(statusLabelKey("paid", "seller")).toBe("status_placed_seller");
	});
});

describe("SHOP_ORDER_TABS / TAB_STATUSES", () => {
	test("every tab has a non-empty statuses list, and no status appears twice", () => {
		expect(Object.keys(TAB_STATUSES).sort()).toEqual(
			[...SHOP_ORDER_TABS].sort(),
		);
		const seen = new Set<string>();
		for (const tab of SHOP_ORDER_TABS) {
			const statuses = TAB_STATUSES[tab];
			expect(statuses.length).toBeGreaterThan(0);
			for (const status of statuses) {
				expect(seen.has(status)).toBe(false);
				seen.add(status);
				expect(ORDER_STATUSES).toContain(status);
			}
		}
	});
});
