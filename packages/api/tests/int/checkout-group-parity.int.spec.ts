// @vitest-environment node
import { describe, expect, it } from "vitest";
import * as mobile from "../../../mobile/src/lib/checkoutGroupFlow";
import mobileEn from "../../../mobile/src/locales/en.json";
import mobileFr from "../../../mobile/src/locales/fr.json";
import webEn from "../../../web/messages/en.json";
import webFr from "../../../web/messages/fr.json";
import * as web from "../../../web/src/lib/checkout-group-flow";
import type {
	CheckoutGroupOrderView,
	CheckoutGroupView,
} from "../../src/contracts/checkoutGroup";

/**
 * P10 (Tasks 20/22): the split checkout's pure stepper exists twice, web's
 * `checkout-group-flow.ts` and mobile's `checkoutGroupFlow.ts`, and the copy
 * the buyer reads beside it exists twice too. Both are held to one seed — the
 * worked fixture (pay-1 / expire-1 / pend-1) every client test already uses.
 * The twins differ in shape by design (mobile lists only mobile-money
 * siblings, web every sibling), so the cells compared are the ones a buyer
 * can see: each sibling's state, the next payable order, its position, the
 * summary counts and whether the group is done.
 */
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
const paid = (id: string) =>
	order({ id, status: "paid", paymentStatus: "paid", payableNow: false });
const expired = (id: string) =>
	order({
		id,
		status: "cancelled",
		paymentStatus: "unpaid",
		payableNow: false,
	});
const failed = (id: string) =>
	order({
		id,
		status: "cancelled",
		paymentStatus: "failed",
		payableNow: false,
	});

const SEEDS: Array<[string, CheckoutGroupView]> = [
	["the worked fixture", view([paid("a"), expired("b"), order({ id: "c" })])],
	["all pending", view([order({ id: "a" }), order({ id: "b" })])],
	["all settled", view([paid("a"), paid("b")])],
	[
		"a failed sibling before a payable one",
		view([failed("a"), order({ id: "b" })]),
	],
	["only expired", view([expired("a"), expired("b")])],
	[
		"a refunded sibling was paid",
		view([
			order({ id: "a", paymentStatus: "refunded", payableNow: false }),
			order({
				id: "b",
				paymentStatus: "partially_refunded",
				payableNow: false,
			}),
			order({ id: "c" }),
		]),
	],
	["a single order", view([order({ id: "a" })])],
];

function webCells(v: CheckoutGroupView) {
	const flow = web.checkoutGroupFlow(v);
	return {
		states: flow.steps.map((s) => [s.orderId, s.state]),
		next: flow.nextPayable?.orderId ?? null,
		position: flow.nextPayable
			? { n: flow.nextPayable.position, total: flow.total }
			: null,
		summary: flow.summary,
		done: flow.done,
	};
}

function mobileCells(v: CheckoutGroupView) {
	const flow = mobile.checkoutGroupFlow(v);
	return {
		states: flow.steps.map((s) => [s.orderId, s.state]),
		next: flow.next,
		position: flow.position,
		summary: flow.summary,
		done: flow.done,
	};
}

describe("the group stepper decides alike on web and mobile", () => {
	for (const [name, seed] of SEEDS) {
		it(name, () => {
			expect(mobileCells(seed)).toEqual(webCells(seed));
		});
	}

	it("the worked fixture reads 3 steps, 1/1/1, next o3 at 3 of 3", () => {
		const cells = webCells(SEEDS[0][1]);
		expect(cells.summary).toEqual({ paid: 1, expired: 1, pending: 1 });
		expect(cells.states).toHaveLength(3);
		expect(cells.next).toBe("c");
		expect(cells.position).toEqual({ n: 3, total: 3 });
		expect(cells.done).toBe(false);
	});

	it("a refunded sibling reads paid on both sides", () => {
		const cells = webCells(SEEDS[5][1]);
		expect(cells.states).toEqual([
			["a", "paid"],
			["b", "paid"],
			["c", "pending"],
		]);
		expect(mobileCells(SEEDS[5][1]).states).toEqual(cells.states);
	});

	it("both clients keep the same split-cart discriminator", () => {
		const flat = { lines: [] } as never;
		const split = { groups: [] } as never;
		expect(mobile.isSplitCart(split)).toBe(web.isSplitCart(split));
		expect(mobile.isSplitCart(flat)).toBe(web.isSplitCart(flat));
		expect(mobile.isSplitQuote(split)).toBe(web.isSplitQuote(split));
		expect(mobile.isSplitQuote(flat)).toBe(web.isSplitQuote(flat));
	});
});

const WEB_ONLY = [
	"groupTitle",
	"retry",
	"deliveryAtCheckout",
	"acceptTerms",
	"placeAll",
	"placeAllCod",
	"unavailableHeading",
	"statePaid",
	"stateExpired",
	"statePending",
	"viewPurchases",
	"purchasesGroupLink",
];
const MOBILE_ONLY = [
	"grandSubtotal",
	"summaryPaid_plural",
	"summaryExpired_plural",
	"summaryPending_plural",
	"groupScreenTitle",
	"groupLoadFailed",
	"viewOrder",
	"openGroup",
	"deliveryFor",
	"placeOrders",
	"unavailableTitle",
];
// Same key, deliberately different copy: web's ICU plurals vs i18next's
// `_plural` pairs, and two headings each platform words for its own layout.
const DIFFERENT_COPY = [
	"summaryPaid",
	"summaryExpired",
	"summaryPending",
	"grandTotal",
	"purchasesHeader",
];
// 15 cells read the same: cart heading, group subtotal/delivery/total/remove,
// stepper position, both pay buttons, the two market notices, the five reasons.
const CHECKOUT_GROUP_SHARED = 15;
const toMobileBraces = (value: string) => value.replace(/\{(\w+)\}/g, "{{$1}}");

describe("the CheckoutGroup copy is the same on web and mobile", () => {
	for (const lang of ["en", "fr"] as const) {
		const webNs = (lang === "en" ? webEn : webFr).CheckoutGroup as Record<
			string,
			string
		>;
		const mobileNs = (lang === "en" ? mobileEn : mobileFr)
			.checkoutGroup as Record<string, string>;

		it(`${lang}: every key is shared or a declared platform difference`, () => {
			const shared = Object.keys(webNs).filter((k) => k in mobileNs);
			expect(
				Object.keys(webNs)
					.filter((k) => !(k in mobileNs))
					.sort(),
			).toEqual([...WEB_ONLY].sort());
			expect(
				Object.keys(mobileNs)
					.filter((k) => !(k in webNs))
					.sort(),
			).toEqual([...MOBILE_ONLY].sort());
			expect(shared.filter((k) => DIFFERENT_COPY.includes(k)).sort()).toEqual(
				[...DIFFERENT_COPY].sort(),
			);
		});

		it(`${lang}: the shared strings match, modulo placeholder braces`, () => {
			const compared = Object.keys(webNs).filter(
				(k) => k in mobileNs && !DIFFERENT_COPY.includes(k),
			);
			const differing = compared.filter(
				(k) => mobileNs[k] !== toMobileBraces(webNs[k] as string),
			);
			expect(differing).toEqual([]);
			expect(compared).toHaveLength(CHECKOUT_GROUP_SHARED);
		});
	}
});

describe("an excluded group's reason maps to the same copy key on both clients", () => {
	const REASONS = [
		"checkout.cityNotServed",
		"checkout.methodUnavailable",
		"order.codUnavailable",
		"order.shopUnavailable",
		"shop.inactive",
		"delivery.noActiveOption",
		"something.new",
	];
	for (const reason of REASONS) {
		it(reason, () => {
			expect(mobile.unavailableReasonKey(reason)).toBe(
				`checkoutGroup.${web.unavailableReasonKey(reason)}`,
			);
		});
	}
});
