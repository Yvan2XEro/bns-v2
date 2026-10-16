import { describe, expect, it } from "bun:test";
import type {
	ResellerFinanceView,
	ResoldListing,
	SupplierResaleProduct,
} from "../../../api/src/contracts/resale";
import {
	canCancelResaleRequest,
	pricesAtMinimum,
	resaleEarnings,
	resaleGain,
	resaleHref,
	resaleLinkCancelPath,
	resaleRules,
	resoldCounts,
	resolveResaleTab,
	supplierStockState,
} from "./resale-hub";

function listing(
	status: ResoldListing["status"],
	price = 2800,
	minRetailPrice: number | null = 3000,
): ResoldListing {
	return {
		listingId: status,
		productId: "p",
		title: "Câble",
		supplier: { id: "s", name: "Mboppi" },
		status,
		variants: [
			{
				id: "v",
				label: null,
				sku: null,
				price,
				supplierPrice: 1500,
				minRetailPrice,
				suggestedRetailPrice: 3500,
				supplierStock: 10,
			},
		],
	};
}

describe("resolveResaleTab", () => {
	it("keeps a shop that cannot supply on the reseller side", () => {
		expect(resolveResaleTab("supplier", "orders", false)).toEqual({
			view: "reseller",
			tab: "find",
		});
		expect(resolveResaleTab(undefined, "resold", false)).toEqual({
			view: "reseller",
			tab: "resold",
		});
	});

	it("opens a supplier on its purchase orders and honours an explicit reseller view", () => {
		expect(resolveResaleTab(undefined, undefined, true)).toEqual({
			view: "supplier",
			tab: "orders",
		});
		expect(resolveResaleTab(undefined, "offered", true)).toEqual({
			view: "supplier",
			tab: "offered",
		});
		expect(resolveResaleTab("reseller", undefined, true)).toEqual({
			view: "reseller",
			tab: "find",
		});
		expect(resolveResaleTab(undefined, "suppliers", true)).toEqual({
			view: "reseller",
			tab: "suppliers",
		});
	});

	it("builds tab links", () => {
		expect(resaleHref("supplier", "resellers")).toBe(
			"/seller/resale?view=supplier&tab=resellers",
		);
	});
});

describe("resale money", () => {
	it("matches the mockup breakdown at 8 %", () => {
		expect(resaleGain(7000, 4000, 800)).toEqual({
			margin: 3000,
			commission: 560,
			gain: 2440,
		});
	});

	it("raises only the variants below the supplier minimum", () => {
		expect(pricesAtMinimum(listing("below_minimum"))).toEqual([
			{ variantId: "v", price: 3000 },
		]);
		expect(pricesAtMinimum(listing("on_sale", 3200))).toEqual([
			{ variantId: "v", price: 3200 },
		]);
	});

	it("sums pending commissions and this month's completed transfers", () => {
		const finance: ResellerFinanceView = {
			commissions: [
				{
					id: "1",
					purchaseOrder: "a",
					amount: 1000,
					status: "accrued",
					createdAt: "2026-10-01",
				},
				{
					id: "2",
					purchaseOrder: "b",
					amount: 500,
					status: "payable",
					createdAt: "2026-10-02",
				},
				{
					id: "3",
					purchaseOrder: "c",
					amount: 700,
					status: "paid",
					createdAt: "2026-09-02",
				},
			],
			charges: [],
			payouts: [
				{
					id: "p1",
					reference: "r",
					grossAmount: 0,
					offsetAmount: 0,
					amount: 4000,
					fee: 0,
					status: "complete",
					createdAt: "2026-10-05T10:00:00.000Z",
				},
				{
					id: "p2",
					reference: "r",
					grossAmount: 0,
					offsetAmount: 0,
					amount: 9000,
					fee: 0,
					status: "complete",
					createdAt: "2026-09-05T10:00:00.000Z",
				},
				{
					id: "p3",
					reference: "r",
					grossAmount: 0,
					offsetAmount: 0,
					amount: 100,
					fee: 0,
					status: "failed",
					createdAt: "2026-10-06T10:00:00.000Z",
				},
			],
			accountRequired: false,
		};
		expect(
			resaleEarnings(finance, new Date("2026-10-15T12:00:00.000Z")),
		).toEqual({
			pending: 1500,
			paidThisMonth: 4000,
		});
	});
});

describe("resold listings", () => {
	it("counts on sale, hidden and out of stock", () => {
		expect(
			resoldCounts([
				listing("on_sale"),
				listing("below_minimum"),
				listing("held"),
				listing("out_of_stock"),
			]),
		).toEqual({ all: 4, on_sale: 1, hidden: 2, out_of_stock: 1 });
	});
});

describe("resaleRules", () => {
	const product = (
		handlingHours: number,
		approvalRequired: boolean,
	): SupplierResaleProduct => ({
		productId: "p",
		title: "t",
		enabled: true,
		resellerCount: 0,
		unitsDelivered30d: 0,
		pendingEffectiveAt: null,
		approvalRequired,
		handlingHours,
		codAccepted: true,
		variants: [],
	});

	it("summarises per-product rules across the offer", () => {
		expect(resaleRules([product(24, true), product(48, false)])).toEqual({
			handling: { min: 24, max: 48 },
			approval: "mixed",
			cod: "all",
		});
		expect(resaleRules([])).toEqual({
			handling: null,
			approval: null,
			cod: null,
		});
	});
});

describe("supplierStockState", () => {
	it("hides the stock wherever the API withheld it", () => {
		expect(supplierStockState([undefined])).toEqual({ kind: "hidden" });
		expect(supplierStockState([])).toEqual({ kind: "hidden" });
	});

	it("reads a large or untracked variant as in stock", () => {
		expect(supplierStockState([3, null])).toEqual({ kind: "in_stock" });
	});

	it("shows a small total exactly and caps a large one", () => {
		expect(supplierStockState([3, 4])).toEqual({ kind: "count", count: 7 });
		expect(supplierStockState([0])).toEqual({ kind: "count", count: 0 });
		expect(supplierStockState([6, 7])).toEqual({ kind: "in_stock" });
	});
});

describe("cancelling a resale request (W36)", () => {
	it("is the reseller's, on a pending request only", () => {
		expect(canCancelResaleRequest("reseller", "requested")).toBe(true);
		expect(canCancelResaleRequest("reseller", "approved")).toBe(false);
		expect(canCancelResaleRequest("supplier", "requested")).toBe(false);
	});

	it("posts to the reseller shop's own link route", () => {
		expect(resaleLinkCancelPath("s 1", "l/1")).toBe(
			"/api/shops/s%201/resale-links/l%2F1/cancel",
		);
	});
});
