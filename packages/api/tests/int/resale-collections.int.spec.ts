// @vitest-environment node
import type { Field, FieldAffectingData } from "payload";
import { describe, expect, it } from "vitest";
import { staffOnlyField } from "../../src/access/staff";
import { CommissionLines } from "../../src/collections/CommissionLines";
import { Listings } from "../../src/collections/Listings";
import { OrderItems } from "../../src/collections/OrderItems";
import { PaymentIntents } from "../../src/collections/PaymentIntents";
import { Products } from "../../src/collections/Products";
import { ProductVariants } from "../../src/collections/ProductVariants";
import { PurchaseOrders } from "../../src/collections/PurchaseOrders";
import { ResaleLinks } from "../../src/collections/ResaleLinks";
import { ResaleTerms } from "../../src/collections/ResaleTerms";
import { ResaleTermsAcceptances } from "../../src/collections/ResaleTermsAcceptances";
import { ResellerCharges } from "../../src/collections/ResellerCharges";
import { ResellerCommissions } from "../../src/collections/ResellerCommissions";
import { ResellerPayouts } from "../../src/collections/ResellerPayouts";
import config from "../../src/payload.config";
import { fakePayload } from "./helpers/fakePayload";

function fieldHasName(field: Field): field is Field & FieldAffectingData {
	return "name" in field && field.type !== "ui";
}

function invoke(access: unknown, args: unknown): unknown {
	return typeof access === "function"
		? Reflect.apply(access, undefined, [args])
		: access;
}

describe("P8 resale collections", () => {
	it("adds the resale schema to products, variants, listings, orders and payments", () => {
		const productResale = Products.fields
			.filter(fieldHasName)
			.find((field) => field.name === "resale");
		const variantResale = ProductVariants.fields
			.filter(fieldHasName)
			.find((field) => field.name === "resale");
		const listingResale = Listings.fields
			.filter(fieldHasName)
			.find((field) => field.name === "resale");
		for (const group of [productResale, variantResale, listingResale]) {
			expect(group?.type).toBe("group");
		}
		const orderItemFields = new Set(
			OrderItems.fields.filter(fieldHasName).map((field) => field.name),
		);
		for (const name of ["purchaseOrder", "resaleLink", "supplierUnitPrice"]) {
			expect(orderItemFields.has(name), `missing order-items.${name}`).toBe(
				true,
			);
		}
		const supplierUnitPrice = OrderItems.fields
			.filter(fieldHasName)
			.find((field) => field.name === "supplierUnitPrice");
		expect(supplierUnitPrice?.access?.read).toBe(staffOnlyField);
		expect(
			CommissionLines.fields.filter(fieldHasName).map((field) => field.name),
		).toContain("reason");
		const purpose = PaymentIntents.fields
			.filter(fieldHasName)
			.find((field) => field.name === "purpose");
		expect(JSON.stringify(purpose)).toContain("reseller_charge");
		const targetType = PaymentIntents.fields
			.filter(fieldHasName)
			.find((field) => field.name === "targetType");
		expect(JSON.stringify(targetType)).toContain("reseller-charge");
	});

	it("defines reseller charges and payouts with service-only writes", async () => {
		expect(ResellerCharges.slug).toBe("reseller-charges");
		expect(ResellerPayouts.slug).toBe("reseller-payouts");
		const chargeFields = new Set(
			ResellerCharges.fields.filter(fieldHasName).map((field) => field.name),
		);
		for (const name of [
			"resellerShop",
			"supplierShop",
			"purchaseOrder",
			"type",
			"amount",
			"status",
			"offsetBy",
			"paymentIntents",
			"waivedBy",
			"waivedNote",
		]) {
			expect(chargeFields.has(name), `missing reseller-charges.${name}`).toBe(
				true,
			);
		}
		const payoutFields = new Set(
			ResellerPayouts.fields.filter(fieldHasName).map((field) => field.name),
		);
		for (const name of [
			"reference",
			"resellerShop",
			"payoutAccount",
			"commissions",
			"charges",
			"grossAmount",
			"offsetAmount",
			"amount",
			"fee",
			"status",
			"approvedBy",
			"approvedAt",
			"providerTransferId",
			"statusHistory",
			"failureReason",
		]) {
			expect(payoutFields.has(name), `missing reseller-payouts.${name}`).toBe(
				true,
			);
		}
		for (const collection of [
			ResellerCommissions,
			ResellerCharges,
			ResellerPayouts,
		]) {
			for (const operation of ["create", "update", "delete"] as const) {
				expect(
					await invoke(collection.access?.[operation], {
						req: { user: { id: "u1", role: "user" } },
					}),
				).toBe(false);
			}
		}
	});

	it("defines one service-owned reseller commission per purchase order", () => {
		expect(ResellerCommissions.slug).toBe("reseller-commissions");
		expect(ResellerCommissions.indexes).toContainEqual({
			fields: ["purchaseOrder"],
			unique: true,
		});
		const fields = new Set(
			ResellerCommissions.fields
				.filter(fieldHasName)
				.map((field) => field.name),
		);
		for (const name of [
			"resellerShop",
			"supplierShop",
			"purchaseOrder",
			"order",
			"saleAmount",
			"supplierAmount",
			"platformCommission",
			"amount",
			"paymentMethod",
			"status",
			"holdReasons",
			"marginLine",
			"payout",
			"paidAt",
			"cancelReason",
		]) {
			expect(fields.has(name), `missing reseller-commissions.${name}`).toBe(
				true,
			);
		}
	});

	it("defines one purchase order per order with service-owned transitions", () => {
		expect(PurchaseOrders.slug).toBe("purchase-orders");
		expect(PurchaseOrders.indexes).toContainEqual({
			fields: ["supplierShop", "status"],
		});
		const numberField = PurchaseOrders.fields
			.filter(fieldHasName)
			.find((field) => field.name === "number");
		const orderField = PurchaseOrders.fields
			.filter(fieldHasName)
			.find((field) => field.name === "order");
		expect(numberField).toMatchObject({ unique: true, required: true });
		expect(orderField).toMatchObject({ unique: true, required: true });
		const fields = new Set(
			PurchaseOrders.fields.filter(fieldHasName).map((field) => field.name),
		);
		for (const name of [
			"number",
			"order",
			"supplierShop",
			"resellerShop",
			"link",
			"status",
			"paymentMethod",
			"items",
			"supplierAmount",
			"deliveryFee",
			"collectAmount",
			"platformCommission",
			"resellerCommission",
			"branding",
			"acceptBy",
			"shipBy",
			"tracking",
			"cancellation",
			"return",
			"statusHistory",
		]) {
			expect(fields.has(name), `missing purchase-orders.${name}`).toBe(true);
		}
		for (const operation of ["create", "update", "delete"] as const) {
			expect(PurchaseOrders.access?.[operation]).toBeDefined();
		}
	});

	it("limits purchase-order money fields to members with payment access", async () => {
		const supplierAmount = PurchaseOrders.fields
			.filter(fieldHasName)
			.find((field) => field.name === "supplierAmount");
		const read = supplierAmount?.access?.read;
		const payload = fakePayload({
			shops: [
				{ id: "supplier", status: "active", level: 2 },
				{ id: "reseller", status: "active", level: 2 },
			],
			"shop-members": [
				{
					id: "supplier-owner",
					shop: "supplier",
					user: "owner",
					role: "owner",
					status: "active",
				},
				{
					id: "reseller-staff",
					shop: "reseller",
					user: "staff",
					role: "staff",
					status: "active",
				},
			],
		});
		const doc = { supplierShop: "supplier", resellerShop: "reseller" };
		expect(
			await invoke(read, {
				req: { user: { id: "owner", role: "user" }, payload },
				doc,
			}),
		).toBe(true);
		expect(
			await invoke(read, {
				req: { user: { id: "staff", role: "user" }, payload },
				doc,
			}),
		).toBe(false);
		const collectAmount = PurchaseOrders.fields
			.filter(fieldHasName)
			.find((field) => field.name === "collectAmount");
		expect(collectAmount?.access?.read).toBeUndefined();
	});

	it("stores append-only terms acceptance evidence with one acceptance per version", () => {
		expect(ResaleTermsAcceptances.slug).toBe("resale-terms-acceptances");
		expect(ResaleTermsAcceptances.indexes).toContainEqual({
			fields: ["shop", "role", "version"],
			unique: true,
		});
		for (const operation of ["create", "update", "delete"] as const) {
			const access = ResaleTermsAcceptances.access?.[operation];
			expect(
				invoke(access, { req: { user: { id: "u1", role: "user" } } }),
			).toBe(false);
		}
	});

	it("defines versioned bilingual resale terms with unique role-version pairs", () => {
		expect(ResaleTerms.slug).toBe("resale-terms");
		expect(ResaleTerms.indexes).toContainEqual({
			fields: ["role", "version"],
			unique: true,
		});
		const fields = new Set(
			ResaleTerms.fields.filter(fieldHasName).map((field) => field.name),
		);
		for (const name of [
			"role",
			"version",
			"bodyFr",
			"bodyEn",
			"summaryFr",
			"summaryEn",
			"publishedAt",
			"requiresReacceptance",
			"enforceAt",
		]) {
			expect(fields.has(name), `missing resale-terms.${name}`).toBe(true);
		}
		const version = ResaleTerms.fields
			.filter(fieldHasName)
			.find((field) => field.name === "version");
		if (version?.type !== "text") throw new Error("version must be text");
		if (typeof version.validate !== "function") {
			throw new Error("version must validate calendar dates");
		}
		expect(Reflect.apply(version.validate, undefined, ["2026-02-28", {}])).toBe(
			true,
		);
		expect(
			Reflect.apply(version.validate, undefined, ["2026-02-30", {}]),
		).not.toBe(true);
	});

	it("defines service-owned resale links with the unique shop pair index", () => {
		expect(ResaleLinks.slug).toBe("resale-links");
		expect(ResaleLinks.indexes).toContainEqual({
			fields: ["supplierShop", "resellerShop"],
			unique: true,
		});
		const fields = new Set(
			ResaleLinks.fields.filter(fieldHasName).map((field) => field.name),
		);
		for (const field of [
			"supplierShop",
			"resellerShop",
			"status",
			"requestedBy",
			"message",
			"resellerTermsVersion",
			"resellerTermsAcceptedAt",
			"decidedBy",
			"decidedAt",
			"suspendedBy",
			"suspendedReason",
			"note",
			"revokedAt",
			"riskHold",
			"stats",
		]) {
			expect(fields.has(field), `missing resale-links.${field}`).toBe(true);
		}
		expect(ResaleLinks.access?.create).toBeDefined();
		expect(ResaleLinks.access?.update).toBeDefined();
		expect(ResaleLinks.access?.delete).toBeDefined();
	});

	it("registers resale-links and limits reads to active members of either shop", async () => {
		const collections = (await config).collections.map(
			(collection) => collection.slug,
		);
		expect(collections).toEqual(
			expect.arrayContaining([
				"resale-links",
				"resale-terms",
				"resale-terms-acceptances",
				"purchase-orders",
				"reseller-commissions",
				"reseller-charges",
				"reseller-payouts",
			]),
		);

		const payload = fakePayload({
			"shop-members": [
				{
					id: "m1",
					shop: "supplier",
					user: "u1",
					role: "owner",
					status: "active",
				},
			],
		});
		const read = ResaleLinks.access?.read;
		const member = await invoke(read, {
			req: { user: { id: "u1", role: "user" }, payload },
		});
		expect(member).toEqual({
			or: [
				{ supplierShop: { in: ["supplier"] } },
				{ resellerShop: { in: ["supplier"] } },
			],
		});

		const stranger = await invoke(read, {
			req: { user: { id: "u2", role: "user" }, payload: fakePayload() },
		});
		expect(stranger).toBe(false);
	});
});
