// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const sendSms = vi.fn();
vi.mock("../../src/services/smsProvider", () => ({
	sendSms: (...args: unknown[]) => sendSms(...args),
}));

import type { Payload, PayloadRequest } from "payload";
import { withTransaction } from "../../src/lib/transactions";
import type { Order, OrderItem } from "../../src/payload-types";
import { accrueCommission } from "../../src/services/commission";
import {
	contestDelivery,
	type DeliveryFailureReason,
	markDelivered,
	markDeliveryFailed,
	reportFailedAttempt,
} from "../../src/services/orders/delivery";
import {
	__resetOrderEventHandlers,
	registerOrderEventHandler,
} from "../../src/services/orders/events";
import { type Doc, type FakePayload, fakePayload } from "./helpers/fakePayload";

const PEPPER = "test-pepper";

function baseOrder(overrides: Doc = {}): Doc {
	return {
		id: "o-1",
		orderNumber: "BNS-2610-000001",
		shop: "s-1",
		status: "shipped",
		paymentMethod: "cod",
		paymentStatus: "cod_pending",
		delivery: { recipientName: "Aicha", phone: "+237600000099" },
		amounts: {
			subtotal: 45_000,
			deliveryFee: 1_000,
			total: 46_000,
			currency: "XAF",
		},
		contract: { locale: "fr" },
		handover: {},
		deliveryFailure: {},
		deadlines: {},
		timestamps: {},
		commission: {},
		...overrides,
	};
}

function baseItem(overrides: Doc = {}): Doc {
	return {
		id: "oi-1",
		order: "o-1",
		product: "p-1",
		variant: "v-1",
		fulfillingShop: "s-1",
		snapshot: { title: "Phone", categoryId: null },
		unitPrice: 45_000,
		quantity: 1,
		lineSubtotal: 45_000,
		commissionRateBps: 800,
		fulfillmentStatus: "shipped",
		...overrides,
	};
}

function baseVariant(overrides: Doc = {}): Doc {
	return {
		id: "v-1",
		product: "p-1",
		shop: "s-1",
		optionValues: {},
		price: 45_000,
		trackInventory: true,
		stockOnHand: 5,
		stockReserved: 1,
		...overrides,
	};
}

function world(seed: Record<string, Doc[]> = {}): FakePayload {
	return fakePayload(
		{
			orders: [baseOrder()],
			"order-items": [baseItem()],
			"product-variants": [baseVariant()],
			products: [{ id: "p-1", shop: "s-1", title: "Phone" }],
			"stock-movements": [],
			"commission-lines": [],
			"order-events": [],
			"buyer-phone-scores": [],
			reports: [],
			...seed,
		},
		{ uniques: { "commission-lines": [["order", "kind"]] } },
	);
}

const orderOf = (payload: FakePayload): Order =>
	structuredClone(payload.store.orders[0]) as unknown as Order;
const movementsOf = (payload: FakePayload) => payload.store["stock-movements"];
const linesOf = (payload: FakePayload) => payload.store["commission-lines"];
const eventsOf = (payload: FakePayload) => payload.store["order-events"];
const scoresOf = (payload: FakePayload) => payload.store["buyer-phone-scores"];
const reportsOf = (payload: FakePayload) => payload.store.reports;
const liveOrder = (payload: FakePayload) => payload.store.orders[0];

function run<T>(
	payload: FakePayload,
	fn: (req: PayloadRequest) => Promise<T>,
): Promise<T> {
	return withTransaction(payload, fn, { user: { id: "u-seller" } });
}

/**
 * Mirrors `commission.ts`'s own (unexported) `accrueCommissionOnDelivery`:
 * registered against `order.delivered` so `markDelivered`'s dispatch —
 * not a direct call — is what produces the commission line, exactly as
 * Task 14 intends it to be consumed. Re-registered in `beforeEach` after
 * `__resetOrderEventHandlers()`, because that reset also clears the
 * dispatch log, and the log is keyed by `OrderEvent.id` — a plain counter
 * that restarts at 1 for every fresh `fakePayload()`, so two different
 * tests' first event would otherwise collide on the same id and the
 * second test's dispatch would be silently skipped as "already seen".
 */
async function accrueOnDelivery(payload: Payload, order: Order): Promise<void> {
	const { docs } = await payload.find({
		collection: "order-items",
		where: { order: { equals: order.id } },
		limit: 0,
		pagination: false,
		depth: 0,
		overrideAccess: true,
	});
	await withTransaction(payload, (req) =>
		accrueCommission(req, order, docs as OrderItem[]),
	);
}

beforeEach(() => {
	process.env.ORDER_PHONE_PEPPER = PEPPER;
	sendSms.mockReset();
	sendSms.mockResolvedValue({ status: "sent" });
	__resetOrderEventHandlers();
	registerOrderEventHandler("order.delivered", accrueOnDelivery);
});

afterEach(() => {
	process.env.ORDER_PHONE_PEPPER = undefined;
});

describe("markDelivered", () => {
	it("one call sells the stock, collects the cash, delivers every item, accrues the commission and sets both deadlines", async () => {
		const payload = world();
		await run(payload, (req) =>
			markDelivered(req, orderOf(payload), {
				method: "otp",
				actorType: "seller",
				actor: "u-seller",
			}),
		);

		expect(movementsOf(payload)).toHaveLength(1);
		expect(liveOrder(payload).paymentStatus).toBe("cod_collected");
		expect(payload.store["order-items"][0].fulfillmentStatus).toBe("delivered");
		expect(linesOf(payload)).toHaveLength(1);
		const deadlines = liveOrder(payload).deadlines as Doc;
		expect(deadlines.completeAt).toBeTruthy();
		expect(deadlines.withdrawalUntil).toBeTruthy();
	});

	// Isolates the stock effect alone, so a markDelivered that quietly skipped
	// `sell` (while still flipping status) could not hide behind the
	// aggregate test above.
	it("sells exactly one movement for the ordered variant", async () => {
		const payload = world();
		await run(payload, (req) =>
			markDelivered(req, orderOf(payload), {
				method: "otp",
				actorType: "seller",
				actor: "u-seller",
			}),
		);
		expect(movementsOf(payload)).toHaveLength(1);
		expect(movementsOf(payload)[0]).toMatchObject({
			type: "sale",
			variant: "v-1",
			order: "o-1",
		});
	});

	it("collects the cash: cod_pending becomes cod_collected", async () => {
		const payload = world();
		await run(payload, (req) =>
			markDelivered(req, orderOf(payload), {
				method: "otp",
				actorType: "seller",
				actor: "u-seller",
			}),
		);
		expect(liveOrder(payload).paymentStatus).toBe("cod_collected");
	});

	it("delivers every item", async () => {
		const payload = world();
		await run(payload, (req) =>
			markDelivered(req, orderOf(payload), {
				method: "otp",
				actorType: "seller",
				actor: "u-seller",
			}),
		);
		expect(payload.store["order-items"][0].fulfillmentStatus).toBe("delivered");
	});

	it("accrues exactly one commission line", async () => {
		const payload = world();
		await run(payload, (req) =>
			markDelivered(req, orderOf(payload), {
				method: "otp",
				actorType: "seller",
				actor: "u-seller",
			}),
		);
		expect(linesOf(payload)).toHaveLength(1);
	});

	// `withdrawalUntil` is the buyer's statutory 15-day return window
	// (`services/orders/withdrawal.ts`'s own `withdrawalDeadline`, art. 20):
	// `deliveredAt + settings.withdrawalDays`, computed from the exact
	// `deliveredAt` this same call writes, never recomputed from `Date.now()`
	// a second time — so the assertion checks the value against the order's
	// own `timestamps.deliveredAt`, not merely that something got written.
	const WITHDRAWAL_DAYS = 15;
	const expectedDeadline = (deliveredAtIso: string): string =>
		new Date(
			Date.parse(deliveredAtIso) + WITHDRAWAL_DAYS * 24 * 60 * 60 * 1000,
		).toISOString();

	it("sets completeAt to deliveredAt + 15 days", async () => {
		const payload = world();
		await run(payload, (req) =>
			markDelivered(req, orderOf(payload), {
				method: "otp",
				actorType: "seller",
				actor: "u-seller",
			}),
		);
		const order = liveOrder(payload);
		const deliveredAt = (order.timestamps as Doc).deliveredAt as string;
		expect((order.deadlines as Doc).completeAt).toBe(
			expectedDeadline(deliveredAt),
		);
	});

	it("sets withdrawalUntil to deliveredAt + 15 days", async () => {
		const payload = world();
		await run(payload, (req) =>
			markDelivered(req, orderOf(payload), {
				method: "otp",
				actorType: "seller",
				actor: "u-seller",
			}),
		);
		const order = liveOrder(payload);
		const deliveredAt = (order.timestamps as Doc).deliveredAt as string;
		expect((order.deadlines as Doc).withdrawalUntil).toBe(
			expectedDeadline(deliveredAt),
		);
	});

	// A retried delivery must not push the buyer's statutory window back: the
	// second call never reaches the write (it throws before), so the value
	// set by the first, winning call is the only one that ever lands.
	it("a replayed delivery does not move withdrawalUntil", async () => {
		const payload = world();
		const snapshot = orderOf(payload);
		await run(payload, (req) =>
			markDelivered(req, snapshot, {
				method: "otp",
				actorType: "seller",
				actor: "u-seller",
			}),
		);
		const firstDeadline = (liveOrder(payload).deadlines as Doc).withdrawalUntil;

		await expect(
			run(payload, (req) =>
				markDelivered(req, snapshot, {
					method: "otp",
					actorType: "seller",
					actor: "u-seller",
				}),
			),
		).rejects.toMatchObject({ code: "order.invalidTransition" });

		expect((liveOrder(payload).deadlines as Doc).withdrawalUntil).toBe(
			firstDeadline,
		);
	});

	// Review Focus 4.
	it("a replayed delivery writes no second sale movement and no second commission line", async () => {
		const payload = world();
		const snapshot = orderOf(payload);

		await run(payload, (req) =>
			markDelivered(req, snapshot, {
				method: "otp",
				actorType: "seller",
				actor: "u-seller",
			}),
		);
		await expect(
			run(payload, (req) =>
				markDelivered(req, snapshot, {
					method: "otp",
					actorType: "seller",
					actor: "u-seller",
				}),
			),
		).rejects.toMatchObject({ code: "order.invalidTransition" });

		expect(movementsOf(payload)).toHaveLength(1);
		expect(linesOf(payload)).toHaveLength(1);
		expect(liveOrder(payload).paymentStatus).toBe("cod_collected");
	});

	// Review Focus 5, case 1: the code budget being spent must not be a dead
	// end for the buyer's own confirmation.
	it("a locked order still reaches delivered by buyer confirmation", async () => {
		const payload = world({
			orders: [
				baseOrder({
					handover: { lockedAt: "2026-10-01T00:00:00.000Z", attempts: 5 },
				}),
			],
		});
		await run(payload, (req) =>
			markDelivered(req, orderOf(payload), {
				method: "buyer_confirmation",
				actorType: "buyer",
				actor: "u-buyer",
			}),
		);
		expect(liveOrder(payload).status).toBe("delivered");
	});

	// Review Focus 5, case 2: nor for the seller's declaration.
	it("a locked order still reaches delivered by seller declaration", async () => {
		const payload = world({
			orders: [
				baseOrder({
					handover: { lockedAt: "2026-10-01T00:00:00.000Z", attempts: 5 },
				}),
			],
		});
		await run(payload, (req) =>
			markDelivered(req, orderOf(payload), {
				method: "seller_declaration",
				actorType: "seller",
				actor: "u-seller",
			}),
		);
		expect(liveOrder(payload).status).toBe("delivered");
		expect((liveOrder(payload).handover as Doc).contestBy).toBeTruthy();
	});

	// The property the matrix's terminal rows exist to protect: a seller
	// cannot turn a buyer's refusal into a delivery. The absence assertions
	// here are paired with the aggregate test above, which proves the exact
	// same three collections DO each gain a row when the transition is
	// legitimate — so a markDelivered that silently did nothing at all could
	// not pass both.
	it("a seller cannot mark delivered an order the buyer already refused", async () => {
		const payload = world({
			orders: [baseOrder({ status: "delivery_failed" })],
		});
		await expect(
			run(payload, (req) =>
				markDelivered(req, orderOf(payload), {
					method: "seller_declaration",
					actorType: "seller",
					actor: "u-seller",
				}),
			),
		).rejects.toMatchObject({ code: "order.invalidTransition" });

		expect(movementsOf(payload)).toHaveLength(0);
		expect(linesOf(payload)).toHaveLength(0);
		expect(scoresOf(payload)).toHaveLength(0);
		expect(sendSms).not.toHaveBeenCalled();
	});
});

describe("markDeliveryFailed", () => {
	const CASES: Array<{
		reason: DeliveryFailureReason;
		paymentStatus: "cod_refused" | "unpaid";
		scored: boolean;
	}> = [
		{ reason: "refused", paymentStatus: "cod_refused", scored: true },
		{ reason: "unreachable", paymentStatus: "cod_refused", scored: true },
		{ reason: "absent", paymentStatus: "cod_refused", scored: true },
		{ reason: "address_not_found", paymentStatus: "unpaid", scored: false },
		{ reason: "timeout", paymentStatus: "unpaid", scored: false },
		{ reason: "other", paymentStatus: "unpaid", scored: false },
	];

	for (const testCase of CASES) {
		it(`reason "${testCase.reason}" releases the stock, sets paymentStatus to "${testCase.paymentStatus}" and ${testCase.scored ? "scores" : "does not score"} the refusal`, async () => {
			const payload = world();
			await run(payload, (req) =>
				markDeliveryFailed(req, orderOf(payload), {
					reason: testCase.reason,
					actorType: "seller",
					actor: "u-seller",
				}),
			);

			expect(liveOrder(payload).status).toBe("delivery_failed");
			expect(liveOrder(payload).paymentStatus).toBe(testCase.paymentStatus);
			expect(movementsOf(payload)).toHaveLength(1);
			expect(movementsOf(payload)[0]).toMatchObject({ type: "release" });
			expect(scoresOf(payload)).toHaveLength(testCase.scored ? 1 : 0);
		});
	}
});

describe("reportFailedAttempt", () => {
	it("the first failed attempt stays shipped and increments attempts", async () => {
		const payload = world();
		const { order } = await run(payload, (req) =>
			reportFailedAttempt(req, orderOf(payload), {
				reason: "unreachable",
				actor: "u-seller",
			}),
		);
		expect(order.status).toBe("shipped");
		expect((order.deliveryFailure as Doc).attempts).toBe(1);
		expect(eventsOf(payload)).toHaveLength(1);
		expect(eventsOf(payload)[0]).toMatchObject({
			type: "order.delivery_attempt_failed",
		});
	});

	it("the second attempt requires mark-delivery-failed", async () => {
		const payload = world({
			orders: [baseOrder({ deliveryFailure: { attempts: 1 } })],
		});
		await expect(
			run(payload, (req) =>
				reportFailedAttempt(req, orderOf(payload), {
					reason: "unreachable",
					actor: "u-seller",
				}),
			),
		).rejects.toMatchObject({ code: "order.invalidTransition" });
		expect(eventsOf(payload)).toHaveLength(0);
	});

	it("reason refused goes straight to mark-delivery-failed", async () => {
		const payload = world();
		await expect(
			run(payload, (req) =>
				reportFailedAttempt(req, orderOf(payload), {
					reason: "refused",
					actor: "u-seller",
				}),
			),
		).rejects.toMatchObject({ code: "order.invalidTransition" });
		expect(eventsOf(payload)).toHaveLength(0);
	});
});

describe("contestDelivery", () => {
	function declaredOrder(contestByOffsetMs: number, overrides: Doc = {}): Doc {
		return baseOrder({
			status: "delivered",
			handover: {
				method: "seller_declaration",
				contestBy: new Date(Date.now() + contestByOffsetMs).toISOString(),
			},
			...overrides,
		});
	}

	it("works only on a declaration", async () => {
		const payload = world({
			orders: [baseOrder({ status: "delivered", handover: { method: "otp" } })],
		});
		await expect(
			run(payload, (req) =>
				contestDelivery(req, orderOf(payload), { actor: "u-buyer" }),
			),
		).rejects.toMatchObject({ code: "order.contestWindowClosed" });
	});

	it("only before contestBy", async () => {
		const payload = world({ orders: [declaredOrder(-1_000)] });
		await expect(
			run(payload, (req) =>
				contestDelivery(req, orderOf(payload), { actor: "u-buyer" }),
			),
		).rejects.toMatchObject({ code: "order.contestWindowClosed" });
	});

	it("sets completionHold: dispute, writes order.delivery_contested and creates one report", async () => {
		const payload = world({ orders: [declaredOrder(60 * 60 * 1000)] });
		await run(payload, (req) =>
			contestDelivery(req, orderOf(payload), {
				note: "wrong item",
				actor: "u-buyer",
			}),
		);

		expect(liveOrder(payload).completionHold).toBe("dispute");
		expect(
			eventsOf(payload).filter((e) => e.type === "order.delivery_contested"),
		).toHaveLength(1);
		expect(reportsOf(payload)).toHaveLength(1);
		expect(reportsOf(payload)[0]).toMatchObject({
			targetType: "order",
			targetId: "o-1",
			reason: "delivery_contested",
		});
	});
});
