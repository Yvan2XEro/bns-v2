// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { sendSms } = vi.hoisted(() => ({ sendSms: vi.fn() }));
vi.mock("../../src/services/smsProvider", () => ({
	sendSms: (...args: unknown[]) => sendSms(...args),
}));
vi.mock("../../src/hooks/notificationEvents", () => ({
	triggerNotificationEvent: vi.fn(async () => undefined),
	hasPushCredential: vi.fn(async () => true),
}));
vi.mock("../../src/hooks/searchEvents", () => ({
	queueSearchEvent: vi.fn(async () => undefined),
}));

import { hashDeliveryPhone } from "../../src/lib/phoneHash";
import { MemoryCounterStore } from "../../src/lib/rateLimit";
import { placeOrder, quoteCheckout } from "../../src/services/checkout";
import { acceptOrder } from "../../src/services/orders/acceptance";
import { __resetOrderEventHandlers } from "../../src/services/orders/events";
import { normalizePhoneNumber } from "../../src/services/phoneVerification";
import { registerPurchaseOrderOrderEvents } from "../../src/services/purchaseOrders";
import { type FakePayload, fakePayload } from "./helpers/fakePayload";

const PEPPER = "test-pepper";
const NOW = new Date("2026-10-02T10:00:00.000Z");
const BUYER = { id: "u-buyer" };
const RESELLER_OWNER = { id: "u-reseller" };
const BUYER_PHONE = "+237670000001";

beforeEach(() => {
	process.env.ORDER_PHONE_PEPPER = PEPPER;
	vi.useFakeTimers({ toFake: ["Date"] });
	vi.setSystemTime(NOW);
	__resetOrderEventHandlers();
});
afterEach(() => {
	process.env.ORDER_PHONE_PEPPER = undefined;
	vi.useRealTimers();
});

const shopRow = (id: string, owner: string, level: number) => ({
	id,
	name: id,
	handle: id,
	owner,
	status: "active",
	level,
	levelExpiresAt: null,
	ordersRestrictedAt: null,
	location: { city: "douala" },
	contact: { phone: "+237690000000" },
	orderSettings: {
		codEnabled: true,
		sellerDeliveryEnabled: true,
		deliveryFee: null,
		deliveryEtaText: "24-48h",
		pickupEnabled: false,
		salesTermsExtra: null,
	},
});

const supplierVariantResale = {
	enabled: true,
	supplierPrice: 4000,
	minRetailPrice: 6500,
	suggestedRetailPrice: 7500,
};

function world(options: { resale?: boolean } = {}) {
	const resale = options.resale !== false;
	return fakePayload(
		{
			users: [
				{
					id: "u-buyer",
					name: "Buyer",
					phone: BUYER_PHONE,
					phoneVerifiedAt: NOW.toISOString(),
				},
				{ id: "u-reseller", name: "Reseller" },
				{ id: "u-supplier", name: "Supplier" },
			],
			shops: [
				shopRow("reseller", "u-reseller", 2),
				shopRow("supplier", "u-supplier", 3),
			],
			products: [
				{
					id: "product",
					shop: "supplier",
					title: "Phone",
					status: "active",
					delivery: { codAllowed: true },
					resale: { enabled: true, codAccepted: true },
				},
				{
					id: "own-product",
					shop: "reseller",
					title: "Own",
					status: "active",
					delivery: { codAllowed: true },
				},
			],
			"product-variants": [
				{
					id: "variant",
					product: "product",
					shop: "supplier",
					sku: "P-1",
					price: 9000,
					trackInventory: true,
					stockOnHand: 3,
					stockReserved: 0,
					archivedAt: null,
					resale: supplierVariantResale,
				},
				{
					id: "own-variant",
					product: "own-product",
					shop: "reseller",
					price: 5000,
					trackInventory: true,
					stockOnHand: 3,
					stockReserved: 0,
					archivedAt: null,
				},
			],
			listings: [
				{
					id: "listing",
					shop: "reseller",
					product: resale ? "product" : "own-product",
					title: "Phone",
					status: "published",
					condition: "new",
					...(resale
						? {
								resale: {
									supplierShop: "supplier",
									link: "link",
									prices: [{ variant: "variant", price: 7000 }],
									holds: [],
								},
							}
						: {}),
				},
			],
			"resale-links": [
				{
					id: "link",
					supplierShop: "supplier",
					resellerShop: "reseller",
					status: "approved",
					riskHold: false,
				},
			],
			"resale-terms": [
				{
					id: "rt",
					role: "reseller",
					version: "v1",
					publishedAt: "2026-01-01T00:00:00Z",
				},
				{
					id: "st",
					role: "supplier",
					version: "v1",
					publishedAt: "2026-01-01T00:00:00Z",
				},
			],
			"resale-terms-acceptances": [
				{ id: "ra", role: "reseller", shop: "reseller", version: "v1" },
				{ id: "sa", role: "supplier", shop: "supplier", version: "v1" },
			],
			"shop-members": [
				{
					id: "sm-r",
					shop: "reseller",
					user: "u-reseller",
					status: "active",
					role: "owner",
				},
				{
					id: "sm-s",
					shop: "supplier",
					user: "u-supplier",
					status: "active",
					role: "owner",
				},
			],
			carts: [
				{
					id: "c-1",
					user: "u-buyer",
					status: "active",
					items: [
						{
							id: "i-1",
							listing: "listing",
							product: resale ? "product" : "own-product",
							variant: resale ? "variant" : "own-variant",
							shop: "reseller",
							quantity: 1,
							priceAtAdd: resale ? 7000 : 5000,
							addedAt: NOW.toISOString(),
						},
					],
				},
			],
			orders: [],
			"order-items": [],
			"order-events": [],
			"stock-movements": [],
			sequences: [],
			"buyer-phone-scores": [
				{
					phoneHash: hashDeliveryPhone(
						PEPPER,
						normalizePhoneNumber(BUYER_PHONE),
					),
					ordersPlaced: 3,
					ordersDelivered: 3,
					cancelledAfterAccept: 0,
					blockedOverride: "none",
					refusals: [],
				},
			],
		},
		{
			uniques: {
				carts: [["user", "status"]],
				"buyer-phone-scores": [["phoneHash"]],
				orders: [["buyer", "idempotencyKey"]],
				sequences: [["key"]],
				"purchase-orders": [["order"]],
			},
			globals: {
				"app-settings": {
					orders: {
						enabled: true,
						launchCities: [{ key: "douala", deliveryFee: 2000 }],
						termsVersion: "2026-09",
						pilotShopIds: [],
					},
					company: {
						legalName: "BuyNSellem SARL",
						supportEmail: "support@buynsellem.com",
						supportPhone: "+237600000000",
					},
					resale: { enabled: true },
				},
			},
			secret: "test-payload-secret",
		},
	);
}

const quoteInput = {
	address: {
		recipientName: "Jean Mballa",
		phone: BUYER_PHONE,
		city: "douala",
		district: "douala.akwa",
		landmark: "Pres de la pharmacie du carrefour",
	},
	deliveryOptionId: "seller_delivery:douala",
	paymentMethod: "cod",
	locale: "fr",
};
const opts = () => ({ now: NOW, store: new MemoryCounterStore() });
const placeInput = (quoteHash: string, idempotencyKey: string) => ({
	...quoteInput,
	quoteHash,
	termsAccepted: true,
	idempotencyKey,
});

async function place(payload: FakePayload) {
	const quote = await quoteCheckout(payload, BUYER, quoteInput, opts());
	return placeOrder(
		payload,
		BUYER,
		placeInput(quote.quoteHash, "idem-1"),
		opts(),
	);
}

describe("resale checkout through the real routes", () => {
	it("persists the sourcing trio with the supplier as fulfilling shop", async () => {
		const payload = world();
		await place(payload);
		const [item] = payload.store["order-items"];
		expect({
			sourcing: item.sourcing,
			resaleLink: item.resaleLink,
			supplierUnitPrice: item.supplierUnitPrice,
			fulfillingShop: item.fulfillingShop,
			unitPrice: item.unitPrice,
			commissionAmount: item.commissionAmount,
		}).toEqual({
			sourcing: "resale",
			resaleLink: "link",
			supplierUnitPrice: 4000,
			fulfillingShop: "supplier",
			unitPrice: 7000,
			commissionAmount: 560,
		});
		expect(payload.store.orders[0].shop).toBe("reseller");
		expect(payload.store["product-variants"][0].stockReserved).toBe(1);
	});

	it("creates the purchase order when the reseller accepts the real order", async () => {
		const payload = world();
		const unregister = registerPurchaseOrderOrderEvents();
		try {
			const placed = await place(payload);
			expect(placed.confirmationRequired).toBe("none");
			await acceptOrder(
				payload,
				RESELLER_OWNER,
				String(payload.store.orders[0].id),
			);
		} finally {
			unregister();
		}
		expect(payload.store["purchase-orders"]).toHaveLength(1);
		expect(payload.store["purchase-orders"][0]).toMatchObject({
			supplierShop: "supplier",
			resellerShop: "reseller",
			link: "link",
			status: "sent",
			supplierAmount: 4000,
			platformCommission: 560,
			resellerCommission: 2440,
			deliveryFee: 2000,
			collectAmount: 9000,
		});
		expect(payload.store["order-items"][0].purchaseOrder).toBe(
			payload.store["purchase-orders"][0].id,
		);
	});

	it("leaves a non-resale checkout as an own-stock order", async () => {
		const payload = world({ resale: false });
		await place(payload);
		const [item] = payload.store["order-items"];
		expect(item.sourcing).toBeUndefined();
		expect(item.resaleLink).toBeUndefined();
		expect(item.supplierUnitPrice).toBeUndefined();
		expect(item.fulfillingShop).toBe("reseller");
	});

	it("refuses a placement whose resale link was revoked after the quote", async () => {
		const payload = world();
		const quote = await quoteCheckout(payload, BUYER, quoteInput, opts());
		payload.store["resale-links"][0].status = "revoked";
		await expect(
			placeOrder(payload, BUYER, placeInput(quote.quoteHash, "idem-2"), opts()),
		).rejects.toMatchObject({ code: "cart.itemUnavailable", status: 409 });
		expect(payload.store.orders).toHaveLength(0);
		expect(payload.store["order-items"]).toHaveLength(0);
	});

	it("binds the quote to the sourcing: a changed supplier price changes the hash", async () => {
		const payload = world();
		const first = await quoteCheckout(payload, BUYER, quoteInput, opts());
		payload.store["product-variants"][0].resale = {
			...supplierVariantResale,
			supplierPrice: 4100,
		};
		const second = await quoteCheckout(payload, BUYER, quoteInput, opts());
		expect(second.quoteHash).not.toBe(first.quoteHash);
	});
});
