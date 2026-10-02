// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CONFIRMATION_MAX_RESENDS } from "../../src/lib/orderCodes";
import { withTransaction } from "../../src/lib/transactions";
import type { Order } from "../../src/payload-types";
import {
	acceptOrder,
	buyerCancelOrder,
	cancelByConfirmationExpiry,
	confirmByBuyerCode,
	confirmBySellerCall,
	declineByTimeout,
	declineOrder,
	resendConfirmationCode,
	sellerCancelOrder,
	shipOrder,
} from "../../src/services/orders/acceptance";
import { issueConfirmationCode } from "../../src/services/orders/confirmation";
import { fakePayload } from "./helpers/fakePayload";

const sendSms = vi.fn();
vi.mock("../../src/services/smsProvider", () => ({
	sendSms: (...args: unknown[]) => sendSms(...args),
}));

const PEPPER = "test-pepper";
const PAST = (ms = 60_000) => new Date(Date.now() - ms).toISOString();
const FUTURE = (ms = 60_000) => new Date(Date.now() + ms).toISOString();

const OWNER = "owner-1";
const MANAGER = "manager-1";
const STAFF = "staff-1";
const BUYER = "buyer-1";
const OUTSIDER = "outsider-1";

const ownerUser = { id: OWNER, role: "user" };
const managerUser = { id: MANAGER, role: "user" };
const staffUser = { id: STAFF, role: "user" };
const buyerUser = { id: BUYER, role: "user" };

function baseOrder(
	overrides: Record<string, unknown> = {},
): Record<string, unknown> {
	return {
		id: "order-1",
		orderNumber: "BNS-2610-000001",
		shop: "shop-1",
		buyer: BUYER,
		status: "confirmed",
		paymentMethod: "cod",
		paymentStatus: "cod_pending",
		delivery: {
			method: "seller_delivery",
			recipientName: "Aicha",
			phone: "+237600000099",
			city: "douala",
		},
		amounts: { subtotal: 15000, deliveryFee: 0, total: 15000, currency: "XAF" },
		deadlines: {},
		timestamps: {},
		contract: { locale: "fr" },
		confirmation: {},
		handover: {},
		cancellation: {},
		...overrides,
	};
}

function baseItem(
	overrides: Record<string, unknown> = {},
): Record<string, unknown> {
	return {
		id: "item-1",
		order: "order-1",
		product: "product-1",
		variant: "variant-1",
		fulfillingShop: "shop-1",
		unitPrice: 15000,
		quantity: 1,
		fulfillmentStatus: "unfulfilled",
		...overrides,
	};
}

function baseVariant(
	overrides: Record<string, unknown> = {},
): Record<string, unknown> {
	return {
		id: "variant-1",
		product: "product-1",
		shop: "shop-1",
		optionValues: {},
		price: 15000,
		trackInventory: true,
		stockOnHand: 5,
		stockReserved: 1,
		...overrides,
	};
}

function seed(
	opts: {
		order?: Record<string, unknown>;
		items?: Record<string, unknown>[];
		variants?: Record<string, unknown>[];
	} = {},
) {
	return fakePayload(
		{
			users: [
				{ id: OWNER, role: "user" },
				{ id: MANAGER, role: "user" },
				{ id: STAFF, role: "user" },
				{ id: BUYER, role: "user" },
				{ id: OUTSIDER, role: "user" },
			],
			shops: [
				{ id: "shop-1", status: "active", owner: OWNER, level: 2, stats: {} },
			],
			"shop-members": [
				{
					id: "m-owner",
					shop: "shop-1",
					user: OWNER,
					role: "owner",
					status: "active",
				},
				{
					id: "m-manager",
					shop: "shop-1",
					user: MANAGER,
					role: "manager",
					status: "active",
				},
				{
					id: "m-staff",
					shop: "shop-1",
					user: STAFF,
					role: "staff",
					status: "active",
				},
			],
			orders: [opts.order ?? baseOrder()],
			"order-items": opts.items ?? [baseItem()],
			"order-events": [],
			"product-variants": opts.variants ?? [baseVariant()],
			"stock-movements": [],
			"buyer-phone-scores": [],
		},
		{ uniques: { "buyer-phone-scores": [["phoneHash"]] } },
	);
}

type Seeded = ReturnType<typeof seed>;

async function freshOrder(payload: Seeded, id = "order-1"): Promise<Order> {
	return (await payload.findByID({
		collection: "orders",
		id,
		overrideAccess: true,
	})) as Order;
}

function events(payload: Seeded) {
	return payload.store["order-events"];
}

function releases(payload: Seeded) {
	return payload.store["stock-movements"].filter((m) => m.type === "release");
}

function variantOf(payload: Seeded, id = "variant-1") {
	return payload.store["product-variants"].find((v) => v.id === id);
}

beforeEach(() => {
	sendSms.mockReset();
	sendSms.mockResolvedValue({ status: "sent" });
	process.env.ORDER_PHONE_PEPPER = PEPPER;
});

afterEach(() => {
	process.env.ORDER_PHONE_PEPPER = undefined;
});

describe("acceptOrder", () => {
	it("moves confirmed -> accepted before acceptBy", async () => {
		const payload = seed({
			order: baseOrder({ deadlines: { acceptBy: FUTURE() } }),
		});
		await acceptOrder(payload, ownerUser, "order-1");
		const order = await freshOrder(payload);
		expect(order.status).toBe("accepted");
	});

	it("refuses after acceptBy with order.acceptDeadlinePassed", async () => {
		const payload = seed({
			order: baseOrder({ deadlines: { acceptBy: PAST() } }),
		});
		await expect(
			acceptOrder(payload, ownerUser, "order-1"),
		).rejects.toMatchObject({
			code: "order.acceptDeadlinePassed",
		});
		expect((await freshOrder(payload)).status).toBe("confirmed");
	});

	it("refuses from placed (the buyer must confirm first)", async () => {
		const payload = seed({ order: baseOrder({ status: "placed" }) });
		await expect(
			acceptOrder(payload, ownerUser, "order-1"),
		).rejects.toMatchObject({
			code: "order.invalidTransition",
		});
	});

	it("refuses from paid in P4 (P5's reserved row)", async () => {
		const payload = seed({ order: baseOrder({ status: "paid" }) });
		await expect(
			acceptOrder(payload, ownerUser, "order-1"),
		).rejects.toMatchObject({
			code: "order.invalidTransition",
		});
	});
});

describe("declineOrder", () => {
	it("works from placed and releases the stock", async () => {
		const payload = seed({
			order: baseOrder({ status: "placed" }),
			items: [baseItem({ quantity: 2 })],
			variants: [baseVariant({ stockReserved: 2 })],
		});
		await declineOrder(payload, ownerUser, "order-1", {
			reason: "seller_out_of_stock",
		});
		expect((await freshOrder(payload)).status).toBe("cancelled");
		expect(releases(payload)).toHaveLength(1);
		expect(variantOf(payload)?.stockReserved).toBe(0);
	});

	it("works from confirmed", async () => {
		const payload = seed({ order: baseOrder({ status: "confirmed" }) });
		await declineOrder(payload, ownerUser, "order-1", {
			reason: "seller_cannot_deliver",
		});
		expect((await freshOrder(payload)).status).toBe("cancelled");
	});

	it("requires a reason", async () => {
		const payload = seed();
		await expect(
			declineOrder(payload, ownerUser, "order-1", {}),
		).rejects.toMatchObject({ code: "order.reasonRequired" });
		expect(events(payload)).toHaveLength(0);
	});

	it('requires a note for "seller_other"', async () => {
		const payload = seed();
		await expect(
			declineOrder(payload, ownerUser, "order-1", { reason: "seller_other" }),
		).rejects.toMatchObject({ code: "order.reasonRequired" });
		expect(events(payload)).toHaveLength(0);
	});
});

describe("sellerCancelOrder", () => {
	it("counts in stats.ordersCancelledBySeller for a manager", async () => {
		const payload = seed({ order: baseOrder({ status: "accepted" }) });
		await sellerCancelOrder(payload, managerUser, "order-1", {
			reason: "seller_other",
			note: "could not fulfil",
		});
		expect((await freshOrder(payload)).status).toBe("cancelled");
		const shop = payload.store.shops.find((s) => s.id === "shop-1");
		expect(
			(shop?.stats as { ordersCancelledBySeller?: number } | undefined)
				?.ordersCancelledBySeller,
		).toBe(1);
	});

	it("gates seller-cancel on the matrix, not a role string: staff gets shop.forbidden", async () => {
		const payload = seed({ order: baseOrder({ status: "accepted" }) });
		await expect(
			sellerCancelOrder(payload, staffUser, "order-1", {
				reason: "seller_other",
				note: "x",
			}),
		).rejects.toMatchObject({ code: "shop.forbidden" });
		expect((await freshOrder(payload)).status).toBe("accepted");
	});
});

describe("buyerCancelOrder", () => {
	it("works from placed, releases the stock, and sets cod_pending -> unpaid", async () => {
		const payload = seed({
			order: baseOrder({ status: "placed" }),
			variants: [baseVariant({ stockReserved: 1 })],
		});
		await buyerCancelOrder(payload, buyerUser, "order-1");
		const order = await freshOrder(payload);
		expect(order.status).toBe("cancelled");
		expect(order.paymentStatus).toBe("unpaid");
		expect(releases(payload)).toHaveLength(1);
	});

	it("increments cancelledAfterAccept after acceptance", async () => {
		const payload = seed({ order: baseOrder({ status: "accepted" }) });
		await buyerCancelOrder(payload, buyerUser, "order-1");
		const scoreRow = payload.store["buyer-phone-scores"][0] as
			| { cancelledAfterAccept?: number }
			| undefined;
		expect(scoreRow?.cancelledAfterAccept).toBe(1);
	});

	it("does not increment cancelledAfterAccept before acceptance", async () => {
		const payload = seed({ order: baseOrder({ status: "confirmed" }) });
		await buyerCancelOrder(payload, buyerUser, "order-1");
		expect(payload.store["buyer-phone-scores"]).toHaveLength(0);
	});

	it("is refused from shipped: stock stays reserved and nothing is released", async () => {
		const payload = seed({
			order: baseOrder({ status: "shipped" }),
			variants: [baseVariant({ stockReserved: 1 })],
		});
		await expect(
			buyerCancelOrder(payload, buyerUser, "order-1"),
		).rejects.toMatchObject({ code: "order.invalidTransition" });
		expect(releases(payload)).toHaveLength(0);
		expect(variantOf(payload)?.stockReserved).toBe(1);
		expect(events(payload)).toHaveLength(0);
	});

	/**
	 * The two reasons `cancellation.reason` can hold from a buyer (spec line
	 * 151), and what happens to a third. This used to coerce anything
	 * unrecognised to `buyer_changed_mind`, which wrote a reason the buyer
	 * never gave into the record with nothing to show it had happened — the
	 * clients were shipping eleven options against these two.
	 */
	it("records each of the two reasons the model stores, as given", async () => {
		for (const reason of [
			"buyer_changed_mind",
			"buyer_ordered_by_mistake",
		] as const) {
			const payload = seed({ order: baseOrder({ status: "placed" }) });
			await buyerCancelOrder(payload, buyerUser, "order-1", { reason });
			const order = await freshOrder(payload);
			expect(order.cancellation).toMatchObject({ by: "buyer", reason });
		}
	});

	it("defaults to buyer_changed_mind when the buyer gives no reason at all", async () => {
		const payload = seed({ order: baseOrder({ status: "placed" }) });
		await buyerCancelOrder(payload, buyerUser, "order-1", {});
		expect((await freshOrder(payload)).cancellation).toMatchObject({
			reason: "buyer_changed_mind",
		});
	});

	it("refuses an unrecognised reason instead of recording a false one", async () => {
		const payload = seed({ order: baseOrder({ status: "placed" }) });
		await expect(
			buyerCancelOrder(payload, buyerUser, "order-1", {
				reason: "found_cheaper",
			}),
		).rejects.toMatchObject({ code: "order.reasonRequired", status: 400 });

		const order = await freshOrder(payload);
		expect(order.status).toBe("placed");
		expect(order.cancellation?.reason ?? null).toBeNull();
		expect(events(payload)).toHaveLength(0);
	});

	it("refuses a seller's reason sent on the buyer's route", async () => {
		const payload = seed({ order: baseOrder({ status: "placed" }) });
		await expect(
			buyerCancelOrder(payload, buyerUser, "order-1", {
				reason: "seller_out_of_stock",
			}),
		).rejects.toMatchObject({ code: "order.reasonRequired" });
		expect((await freshOrder(payload)).status).toBe("placed");
	});
});

describe("shipOrder", () => {
	it("moves accepted -> shipped, ships every item, issues the handover code and sets staleAt", async () => {
		const payload = seed({
			order: baseOrder({ status: "accepted" }),
			items: [baseItem({ id: "item-1" }), baseItem({ id: "item-2" })],
		});
		await shipOrder(payload, ownerUser, "order-1");
		const order = await freshOrder(payload);
		expect(order.status).toBe("shipped");
		expect(order.deadlines?.staleAt).toBeTruthy();
		expect(order.handover?.codeHash).toBeTruthy();
		const items = payload.store["order-items"];
		expect(items.every((i) => i.fulfillmentStatus === "shipped")).toBe(true);
		expect(sendSms).toHaveBeenCalledTimes(1);
	});

	it("labels a pickup order ready for pickup", async () => {
		const payload = seed({
			order: baseOrder({
				status: "accepted",
				delivery: {
					method: "pickup",
					recipientName: "Aicha",
					phone: "+237600000099",
					city: "douala",
				},
			}),
		});
		await shipOrder(payload, ownerUser, "order-1");
		const order = await freshOrder(payload);
		expect(order.delivery.etaText).toBe("Prêt pour le retrait");
	});
});

describe("two shop members processing the same order at once", () => {
	it("two concurrent accepts produce one winner and one event", async () => {
		const payload = seed({ order: baseOrder({ status: "confirmed" }) });
		const [a, b] = await Promise.allSettled([
			acceptOrder(payload, ownerUser, "order-1"),
			acceptOrder(payload, managerUser, "order-1"),
		]);
		expect([a.status, b.status].sort()).toEqual(["fulfilled", "rejected"]);
		expect((await freshOrder(payload)).status).toBe("accepted");
		expect(events(payload)).toHaveLength(1);
		const loser = a.status === "rejected" ? a : b;
		if (loser.status !== "rejected") throw new Error("expected a loser");
		expect(loser.reason).toMatchObject({ details: { status: "accepted" } });
	});

	it("accept racing decline produces one terminal outcome", async () => {
		const payload = seed({ order: baseOrder({ status: "confirmed" }) });
		const [a, b] = await Promise.allSettled([
			acceptOrder(payload, ownerUser, "order-1"),
			declineOrder(payload, managerUser, "order-1", {
				reason: "seller_other",
				note: "x",
			}),
		]);
		expect([a.status, b.status].sort()).toEqual(["fulfilled", "rejected"]);
		const order = await freshOrder(payload);
		expect(["accepted", "cancelled"]).toContain(order.status);
		expect(events(payload)).toHaveLength(1);
	});
});

describe("a buyer cancelling while the courier is at the door", () => {
	it("cancel racing ship leaves one winner, one release decision, and no handover SMS when cancel wins", async () => {
		const payload = seed({ order: baseOrder({ status: "accepted" }) });
		const [cancelResult, shipResult] = await Promise.allSettled([
			buyerCancelOrder(payload, buyerUser, "order-1"),
			shipOrder(payload, ownerUser, "order-1"),
		]);
		expect([cancelResult.status, shipResult.status].sort()).toEqual([
			"fulfilled",
			"rejected",
		]);

		const terminalEvents = events(payload).filter(
			(e) => e.type === "order.cancelled" || e.type === "order.shipped",
		);
		expect(terminalEvents).toHaveLength(1);

		if (cancelResult.status === "fulfilled") {
			expect(releases(payload)).toHaveLength(1);
			expect(sendSms).not.toHaveBeenCalled();
			expect((await freshOrder(payload)).status).toBe("cancelled");
		} else {
			expect(releases(payload)).toHaveLength(0);
			expect(sendSms).toHaveBeenCalledTimes(1);
			expect((await freshOrder(payload)).status).toBe("shipped");
		}
	});
});

describe("confirmBySellerCall", () => {
	it("applies placed -> confirmed -> accepted in one transaction and writes two events", async () => {
		const payload = seed({
			order: baseOrder({
				status: "placed",
				deadlines: { confirmBy: FUTURE() },
			}),
		});
		await confirmBySellerCall(payload, ownerUser, "order-1");
		const order = await freshOrder(payload);
		expect(order.status).toBe("accepted");
		const rows = events(payload);
		expect(rows.map((e) => e.type)).toEqual([
			"order.confirmed",
			"order.accepted",
		]);
		const transactionIds = new Set(payload.writes.map((w) => w.transactionID));
		expect(transactionIds.size).toBe(1);
	});

	it("is refused after confirmBy with order.confirmationCodeExpired", async () => {
		const payload = seed({
			order: baseOrder({ status: "placed", deadlines: { confirmBy: PAST() } }),
		});
		await expect(
			confirmBySellerCall(payload, ownerUser, "order-1"),
		).rejects.toMatchObject({ code: "order.confirmationCodeExpired" });
		expect((await freshOrder(payload)).status).toBe("placed");
		expect(events(payload)).toHaveLength(0);
	});
});

describe("the confirmation code route", () => {
	it("is the buyer's alone: a shop member gets order.notFound", async () => {
		const payload = seed({ order: baseOrder({ status: "placed" }) });
		await expect(
			confirmByBuyerCode(payload, ownerUser, "order-1", "123456"),
		).rejects.toMatchObject({ code: "order.notFound" });
	});

	it("confirms placed -> confirmed for the buyer with a valid code", async () => {
		const payload = seed({ order: baseOrder({ status: "placed" }) });
		const order = await freshOrder(payload);
		const { code } = await withTransaction(payload, (req) =>
			issueConfirmationCode(req, order, { resend: false }),
		);
		await confirmByBuyerCode(payload, buyerUser, "order-1", code);
		expect((await freshOrder(payload)).status).toBe("confirmed");
	});
});

describe("resendConfirmationCode", () => {
	it("respects the cooldown", async () => {
		const payload = seed({
			order: baseOrder({
				status: "placed",
				confirmation: { sentAt: new Date().toISOString(), resendCount: 0 },
			}),
		});
		await expect(
			resendConfirmationCode(payload, buyerUser, "order-1"),
		).rejects.toMatchObject({ code: "order.codeResendLimit" });
	});

	it("respects the resend limit", async () => {
		const payload = seed({
			order: baseOrder({
				status: "placed",
				confirmation: {
					sentAt: PAST(120_000),
					resendCount: CONFIRMATION_MAX_RESENDS,
				},
			}),
		});
		await expect(
			resendConfirmationCode(payload, buyerUser, "order-1"),
		).rejects.toMatchObject({ code: "order.codeResendLimit" });
	});
});

describe("cancelByConfirmationExpiry and declineByTimeout", () => {
	it("cancelByConfirmationExpiry writes the system actor and confirmation_expired", async () => {
		const payload = seed({ order: baseOrder({ status: "placed" }) });
		const order = await freshOrder(payload);
		await withTransaction(payload, (req) =>
			cancelByConfirmationExpiry(req, order),
		);
		const [event] = events(payload);
		expect(event).toMatchObject({
			type: "order.cancelled",
			actorType: "system",
			reason: "confirmation_expired",
		});
		expect((await freshOrder(payload)).status).toBe("cancelled");
	});

	it("declineByTimeout writes the system actor and seller_timeout", async () => {
		const payload = seed({ order: baseOrder({ status: "confirmed" }) });
		const order = await freshOrder(payload);
		await withTransaction(payload, (req) => declineByTimeout(req, order));
		const [event] = events(payload);
		expect(event).toMatchObject({
			type: "order.declined",
			actorType: "system",
			reason: "seller_timeout",
		});
		expect((await freshOrder(payload)).status).toBe("cancelled");
	});
});
