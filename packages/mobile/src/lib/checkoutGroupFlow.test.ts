import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { CheckoutGroupView } from "../../../api/src/contracts/checkoutGroup";
import type {
	CartView,
	OrderListEntry,
	QuoteResponse,
	SplitCartView,
	SplitQuoteView,
} from "../types/order";
import {
	checkoutGroupFlow,
	isSplitCart,
	isSplitQuote,
	splitPlaceBody,
	unavailableReasonKey,
	withGroupHeaders,
} from "./checkoutGroupFlow";

const shop = (id: string, name: string) => ({
	id,
	name,
	handle: name.toLowerCase(),
	city: "douala",
});

// The worked fixture shared with web's checkout-group-flow: pay 1, expire 2, leave 3 pending.
const PAID_EXPIRED_PENDING: CheckoutGroupView = {
	checkoutGroup: "CHK-2610-0001",
	orders: [
		{
			id: "o1",
			orderNumber: "ORD-2610-0001",
			shop: shop("sa", "Alpha"),
			total: 27_000,
			currency: "XAF",
			paymentMethod: "mobile_money",
			status: "paid",
			paymentStatus: "paid",
			payableNow: false,
		},
		{
			id: "o2",
			orderNumber: "ORD-2610-0002",
			shop: shop("sb", "Bravo"),
			total: 17_000,
			currency: "XAF",
			paymentMethod: "mobile_money",
			status: "cancelled",
			paymentStatus: "unpaid",
			payableNow: false,
		},
		{
			id: "o3",
			orderNumber: "ORD-2610-0003",
			shop: shop("sc", "Charlie"),
			total: 9_000,
			currency: "XAF",
			paymentMethod: "mobile_money",
			status: "placed",
			paymentStatus: "awaiting_payment",
			payableNow: true,
		},
	],
};

describe("checkoutGroupFlow over the paid / expired / pending fixture", () => {
	test("whole-object", () => {
		expect(checkoutGroupFlow(PAID_EXPIRED_PENDING)).toEqual({
			steps: [
				{ orderId: "o1", state: "paid" },
				{ orderId: "o2", state: "expired" },
				{ orderId: "o3", state: "pending" },
			],
			next: "o3",
			position: { n: 3, total: 3 },
			summary: { paid: 1, expired: 1, pending: 1 },
			done: false,
		});
	});

	test("the first payable order is next, and the position counts from it", () => {
		const fresh: CheckoutGroupView = {
			...PAID_EXPIRED_PENDING,
			orders: PAID_EXPIRED_PENDING.orders.map((order) => ({
				...order,
				status: "placed",
				paymentStatus: "awaiting_payment",
				payableNow: true,
			})),
		};
		const flow = checkoutGroupFlow(fresh);
		expect(flow.next).toBe("o1");
		expect(flow.position).toEqual({ n: 1, total: 3 });
		expect(flow.summary).toEqual({ paid: 0, expired: 0, pending: 3 });
	});

	test("nothing payable left: no next, no position, done", () => {
		const settled: CheckoutGroupView = {
			...PAID_EXPIRED_PENDING,
			orders: PAID_EXPIRED_PENDING.orders.slice(0, 2),
		};
		const flow = checkoutGroupFlow(settled);
		expect(flow.next).toBeNull();
		expect(flow.position).toBeNull();
		expect(flow.done).toBe(true);
	});

	test("payableNow is the server's word, whatever the status says", () => {
		const view: CheckoutGroupView = {
			checkoutGroup: "g",
			orders: [
				{
					...PAID_EXPIRED_PENDING.orders[2],
					status: "cancelled",
					payableNow: true,
				},
			],
		};
		expect(checkoutGroupFlow(view).next).toBe("o3");
	});

	test("a cash-on-delivery sibling is outside the stepper", () => {
		const view: CheckoutGroupView = {
			checkoutGroup: "g",
			orders: [
				{
					...PAID_EXPIRED_PENDING.orders[0],
					paymentMethod: "cod",
					paymentStatus: "cod_pending",
					status: "placed",
				},
				PAID_EXPIRED_PENDING.orders[2],
			],
		};
		const flow = checkoutGroupFlow(view);
		expect(flow.steps).toEqual([{ orderId: "o3", state: "pending" }]);
		expect(flow.position).toEqual({ n: 1, total: 1 });
	});
});

describe("the flag-off shapes stay the single-shop flow", () => {
	const flatCart: CartView = {
		id: "c",
		shop: shop("sa", "Alpha"),
		lines: [],
		subtotal: 0,
		shopOrderable: true,
		currency: "XAF",
	};
	const splitCart: SplitCartView = {
		id: "c",
		market: { countryCode: "CM", currency: "XAF" },
		groups: [],
		grandSubtotal: 0,
	};

	test("a flat cart is never split, a grouped one is", () => {
		expect(isSplitCart(flatCart)).toBe(false);
		expect(isSplitCart(splitCart)).toBe(true);
	});

	test("a flat quote is never split, a grouped one is", () => {
		const flat = { summary: {}, quoteHash: "h" } as unknown as QuoteResponse;
		const split: SplitQuoteView = {
			market: { countryCode: "CM", currency: "XAF" },
			groups: [],
			unavailableGroups: [],
			grandTotal: 0,
			quoteHash: "h",
		};
		expect(isSplitQuote(flat)).toBe(false);
		expect(isSplitQuote(split)).toBe(true);
	});
});

describe("splitPlaceBody", () => {
	const address = {
		recipientName: "A",
		phone: "+237650000001",
		city: "douala",
		district: "douala.akwa",
		addressLine: "x",
	} as unknown as Parameters<typeof splitPlaceBody>[0]["address"];
	const quote: SplitQuoteView = {
		market: { countryCode: "CM", currency: "XAF" },
		groups: [],
		unavailableGroups: [],
		grandTotal: 53_000,
		quoteHash: "hash",
	};

	test("echoes the quote hash and the picks, only after acceptance", () => {
		const input = {
			address,
			quote,
			paymentMethod: "mobile_money" as const,
			deliveryByGroup: { "a:a": "opt1" },
			accepted: true,
			idempotencyKey: "k",
			locale: "fr" as const,
		};
		expect(splitPlaceBody(input)).toEqual({
			address,
			paymentMethod: "mobile_money",
			locale: "fr",
			deliveryByGroup: { "a:a": "opt1" },
			quoteHash: "hash",
			termsAccepted: true,
			idempotencyKey: "k",
		});
		expect(splitPlaceBody({ ...input, accepted: false })).toBeNull();
	});
});

describe("unavailableReasonKey", () => {
	test.each([
		["checkout.cityNotServed", "checkoutGroup.unavailable_not_served"],
		["order.codUnavailable", "checkoutGroup.unavailable_cod_not_allowed"],
		["order.shopUnavailable", "checkoutGroup.unavailable_shop_inactive"],
		["something.else", "checkoutGroup.unavailable_other"],
	])("%s", (code, key) => {
		expect(unavailableReasonKey(code)).toBe(key);
	});
});

describe("withGroupHeaders", () => {
	const entry = (id: string, checkoutGroup?: string): OrderListEntry =>
		({ id, checkoutGroup }) as OrderListEntry;

	test("one header before the first sibling of each group, singles untouched", () => {
		const out = withGroupHeaders([
			entry("a"),
			entry("b", "g1"),
			entry("c"),
			entry("d", "g1"),
			entry("e", "g2"),
		]);
		expect(
			out.map((item) =>
				item.kind === "header" ? `H:${item.checkoutGroup}` : item.entry.id,
			),
		).toEqual(["a", "H:g1", "b", "c", "d", "H:g2", "e"]);
	});
});

describe("nothing here derives what the server decides", () => {
	const root = join(import.meta.dir, "../..");
	const files = [
		"src/lib/checkoutGroupFlow.ts",
		"app/purchases/group/[group].tsx",
		"src/components/cart/SplitCart.tsx",
		"src/components/checkout/SplitReview.tsx",
	].map((f) => ({ f, text: readFileSync(join(root, f), "utf8") }));

	test.each(files)("$f has no summed total and no local payableNow", ({
		text,
	}) => {
		expect(text).not.toMatch(/\.reduce\(/);
		expect(text).not.toMatch(/(grandTotal|grandSubtotal)\s*=[^=]/);
		expect(text).not.toMatch(/(const|let)\s+payableNow\b/);
		expect(text).not.toMatch(/payableNow\s*[:=][^\n]*status/);
	});
});
