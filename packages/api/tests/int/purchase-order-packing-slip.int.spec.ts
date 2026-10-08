// @vitest-environment node
import { describe, expect, it } from "vitest";
import { getPurchaseOrderPackingSlipHtml } from "../../src/services/purchaseOrderPackingSlip";
import { fakePayload } from "./helpers/fakePayload";

describe("purchase order packing slip", () => {
	it("renders bilingual print pages with delivery codes and no supplier cost", async () => {
		const payload = fakePayload({
			shops: [
				{
					id: "supplier",
					name: "Supplier <script>alert(1)</script>",
					owner: "supplier-user",
					status: "active",
					level: 3,
					location: { city: "Douala" },
				},
				{ id: "reseller", status: "active", level: 2 },
			],
			"shop-members": [
				{
					id: "supplier-membership",
					shop: "supplier",
					user: "supplier-user",
					role: "owner",
					status: "active",
				},
			],
			orders: [
				{
					id: "order-1",
					orderNumber: "BNS-1",
					shop: "reseller",
					buyer: "buyer",
					status: "shipped",
					paymentMethod: "cod",
					paymentStatus: "cod_pending",
					amounts: { total: 9_000 },
					delivery: {
						recipientName: "Buyer <b>One</b>",
						phone: "+237600000000",
						city: "Douala",
						district: "Akwa",
						landmark: "Rue < 4",
						gps: { lat: 4.0511, lng: 9.7679 },
					},
				},
			],
			"purchase-orders": [
				{
					id: "po-1",
					number: "PO-2609-0001",
					order: "order-1",
					supplierShop: "supplier",
					resellerShop: "reseller",
					link: "link-1",
					status: "shipped",
					paymentMethod: "cod",
					items: [
						{
							orderItem: "item-1",
							variant: "variant-1",
							title: "Phone <img src=x onerror=alert(1)>",
							sku: "SKU-42",
							quantity: 2,
							supplierUnitPrice: 4_000,
							resellerUnitPrice: 7_000,
						},
					],
					supplierAmount: 8_000,
					deliveryFee: 2_000,
					collectAmount: 16_000,
					platformCommission: 1_120,
					resellerCommission: 4_880,
					branding: {
						name: "Akwa Tech",
						handle: "akwa-tech",
						phone: "+237699000000",
					},
					sentAt: "2026-09-15T10:00:00.000Z",
					acceptBy: "2026-09-16T10:00:00.000Z",
					statusHistory: [],
				},
			],
		});

		const html = await getPurchaseOrderPackingSlipHtml(
			payload,
			{ id: "supplier-user", role: "user" },
			"po-1",
			"fr",
		);

		expect(html).toContain("@page label { size: 105mm 148mm;");
		expect(html).toContain("@page slip { size: 148mm 210mm;");
		expect(html).toContain("Akwa Tech");
		expect(html).toContain("Expédié depuis Douala");
		expect(html).toContain("Buyer &lt;b&gt;One&lt;/b&gt;");
		expect(html).toContain("Rue &lt; 4");
		expect(html).toContain("SKU-42");
		expect(html).toContain("16 000 XAF");
		expect(html).toContain('data-barcode="code128"');
		expect(html).toContain('data-gps="4.0511,9.7679"');
		expect(html).not.toContain("4 000");
		expect(html).not.toContain("<script>alert(1)</script>");
		expect(html).not.toContain("<img src=x onerror=alert(1)>");
	});
});
