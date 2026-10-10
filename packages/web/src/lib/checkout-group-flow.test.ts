import { describe, expect, test } from "bun:test";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import type { QuoteResponse } from "~/types/order";
import type {
	CheckoutGroupOrderView,
	CheckoutGroupView,
} from "../../../api/src/contracts/checkoutGroup";
import {
	checkoutGroupFlow,
	groupOrderState,
	isSplitCart,
	isSplitQuote,
	unavailableReasonKey,
} from "./checkout-group-flow";

const shop = { id: "s", name: "Shop", handle: "shop", city: null };
const order = (
	over: Partial<CheckoutGroupOrderView> & { id: string },
): CheckoutGroupOrderView => ({
	orderNumber: `BNS-${over.id}`,
	shop,
	total: 1000,
	currency: "XAF",
	paymentMethod: "mobile_money",
	status: "placed",
	paymentStatus: "unpaid",
	payableNow: true,
	...over,
});
const view = (orders: CheckoutGroupOrderView[]): CheckoutGroupView => ({
	checkoutGroup: "g1",
	orders,
});

// pay-1 / expire-1 / pend-1
const worked = view([
	order({ id: "a", status: "paid", paymentStatus: "paid", payableNow: false }),
	order({
		id: "b",
		status: "cancelled",
		paymentStatus: "unpaid",
		payableNow: false,
	}),
	order({ id: "c" }),
]);

describe("checkoutGroupFlow", () => {
	test("worked fixture: exact stepper values", () => {
		const flow = checkoutGroupFlow(worked);
		expect(flow.total).toBe(3);
		expect(flow.summary).toEqual({ paid: 1, expired: 1, pending: 1 });
		expect(flow.steps.map((s) => [s.orderId, s.position, s.state])).toEqual([
			["a", 1, "paid"],
			["b", 2, "expired"],
			["c", 3, "pending"],
		]);
		expect(flow.nextPayable?.orderId).toBe("c");
		expect(flow.nextPayable?.position).toBe(3);
		expect(flow.done).toBe(false);
	});

	test("a failed sibling never blocks the next payable one", () => {
		const flow = checkoutGroupFlow(
			view([
				order({
					id: "a",
					paymentStatus: "failed",
					payableNow: false,
					status: "cancelled",
				}),
				order({ id: "b" }),
			]),
		);
		expect(flow.nextPayable?.orderId).toBe("b");
	});

	test("all settled is done with no next step", () => {
		const flow = checkoutGroupFlow(
			view([
				order({ id: "a", paymentStatus: "paid", payableNow: false }),
				order({ id: "b", status: "cancelled", payableNow: false }),
			]),
		);
		expect(flow.nextPayable).toBeNull();
		expect(flow.done).toBe(true);
	});

	test("an unpaid order outside its window but not cancelled stays pending, unpayable", () => {
		const o = order({ id: "x", payableNow: false });
		expect(groupOrderState(o)).toBe("pending");
		expect(checkoutGroupFlow(view([o])).nextPayable).toBeNull();
	});

	test("the first payable in server order is next", () => {
		const flow = checkoutGroupFlow(
			view([order({ id: "a" }), order({ id: "b" })]),
		);
		expect(flow.nextPayable?.orderId).toBe("a");
	});
});

const GROUPED = [
	"src/app/(public)/cart/cart-groups.tsx",
	"src/app/(checkout)/checkout/group-checkout.tsx",
	"src/app/(checkout)/checkout/group/[group]/group-client.tsx",
	"src/lib/checkout-group-flow.ts",
	"src/hooks/use-checkout-group.ts",
];

function walk(dir: string): string[] {
	if (!existsSync(dir)) return [];
	return readdirSync(dir).flatMap((name) => {
		const path = join(dir, name);
		return statSync(path).isDirectory() ? walk(path) : [path];
	});
}

describe("grouped screens render the server's totals as given", () => {
	test("no client-side summing of totals", () => {
		const root = join(import.meta.dir, "../..");
		const files = [
			...GROUPED.map((f) => join(root, f)),
			...walk(join(root, "src/app/(checkout)/checkout/group")),
		];
		for (const file of new Set(files)) {
			let text: string;
			try {
				text = readFileSync(file, "utf8");
			} catch {
				continue;
			}
			expect(text, file).not.toMatch(/\.reduce\s*\(/);
			expect(text, file).not.toMatch(
				/grandTotal\s*=|grandSubtotal\s*=|total\s*\+=/,
			);
		}
	});
});

describe("wire shape helpers", () => {
	test("the groups array marks a split cart and quote", () => {
		expect(
			isSplitCart({ id: null, market: null, groups: [], grandSubtotal: 0 }),
		).toBe(true);
		expect(
			isSplitCart({
				id: null,
				shop: null,
				lines: [],
				subtotal: 0,
				shopOrderable: true,
				currency: "XAF",
			}),
		).toBe(false);
	});
	test("reasons map to the copy keys, anything else to other", () => {
		expect(unavailableReasonKey("order.codUnavailable")).toBe(
			"unavailable_cod_not_allowed",
		);
		expect(unavailableReasonKey("checkout.cityNotServed")).toBe(
			"unavailable_not_served",
		);
		expect(unavailableReasonKey("whatever")).toBe("unavailable_other");
	});
});

describe("quote shape guard", () => {
	const flatQuote = JSON.parse(
		'{"summary":{},"quoteHash":"h"}',
	) as QuoteResponse;
	test("groups marks the split quote, the flat summary is not", () => {
		const split = {
			market: { countryCode: "CM", currency: "XAF" },
			groups: [],
			unavailableGroups: [],
			grandTotal: 0,
			quoteHash: "h",
		};
		expect(isSplitQuote(split)).toBe(true);
		expect(isSplitQuote(flatQuote)).toBe(false);
	});
});
