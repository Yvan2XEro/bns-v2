// @vitest-environment node
import type { PayloadRequest } from "payload";
import { beforeEach, describe, expect, it, vi } from "vitest";

const sendSms = vi.fn();
vi.mock("../../src/services/smsProvider", () => ({
	sendSms: (...args: unknown[]) => sendSms(...args),
}));

import {
	HANDOVER_CODE_LENGTH,
	HANDOVER_MAX_ATTEMPTS,
	HANDOVER_MAX_REGENERATIONS,
} from "../../src/lib/orderCodes";
import { withTransaction } from "../../src/lib/transactions";
import type { Order } from "../../src/payload-types";
import {
	canRegenerateHandover,
	issueHandoverCode,
	verifyHandoverCode,
} from "../../src/services/orders/handover";
import { fakePayload } from "./helpers/fakePayload";

function baseOrder(
	overrides: Record<string, unknown> = {},
): Record<string, unknown> {
	return {
		id: "order-1",
		orderNumber: "BNS-2610-000001",
		shop: "shop-1",
		status: "shipped",
		paymentMethod: "cod",
		paymentStatus: "cod_pending",
		delivery: { recipientName: "Aicha", phone: "+237600000099" },
		amounts: { total: 15000, currency: "XAF" },
		contract: { locale: "fr" },
		handover: {},
		...overrides,
	};
}

function seed(order: Record<string, unknown>) {
	return fakePayload({ orders: [order], "order-events": [] });
}

async function freshOrder(
	payload: ReturnType<typeof fakePayload>,
): Promise<Order> {
	return (await payload.findByID({
		collection: "orders",
		id: "order-1",
		overrideAccess: true,
	})) as Order;
}

function withReq<T>(
	payload: ReturnType<typeof fakePayload>,
	fn: (req: PayloadRequest) => Promise<T>,
): Promise<T> {
	return withTransaction(payload, fn);
}

const COURIER = { type: "courier" as const, id: "courier-9" };

beforeEach(() => {
	sendSms.mockReset();
	sendSms.mockResolvedValue({ status: "sent" });
});

describe("issueHandoverCode", () => {
	it("issues a four-digit code, stores only its hash, and returns the plaintext once", async () => {
		const payload = seed(baseOrder());
		const order = await freshOrder(payload);

		const result = await withReq(payload, (req) =>
			issueHandoverCode(req, order, { regenerate: false }),
		);

		expect(result.code).toMatch(/^\d{4}$/);
		expect(result.code.length).toBe(HANDOVER_CODE_LENGTH);

		const stored = await freshOrder(payload);
		expect(stored.handover?.codeHash).toBeTruthy();
		expect(String(stored.handover?.codeHash)).not.toContain(result.code);
	});

	it("queues the SMS after the commit, not during", async () => {
		const payload = seed(baseOrder());
		const order = await freshOrder(payload);
		const calls: string[] = [];
		const originalCommit = payload.db.commitTransaction.bind(payload.db);
		vi.spyOn(payload.db, "commitTransaction").mockImplementation(
			async (id: string) => {
				await originalCommit(id);
				calls.push("commit");
			},
		);
		sendSms.mockImplementation(async () => {
			calls.push("sms");
			return { status: "sent" };
		});

		await withReq(payload, (req) =>
			issueHandoverCode(req, order, { regenerate: false }),
		);

		expect(sendSms).toHaveBeenCalledTimes(1);
		expect(calls).toEqual(["commit", "sms"]);
	});

	it("never calls sendSms when the transaction rolls back", async () => {
		const payload = seed(baseOrder());
		const order = await freshOrder(payload);

		await expect(
			withReq(payload, async (req) => {
				await issueHandoverCode(req, order, { regenerate: false });
				throw new Error("boom");
			}),
		).rejects.toThrow("boom");

		expect(sendSms).not.toHaveBeenCalled();
		const stored = await freshOrder(payload);
		expect(stored.handover?.codeHash ?? null).toBeNull();
	});

	it("no event's metadata carries the code", async () => {
		const payload = seed(baseOrder());
		const order = await freshOrder(payload);
		const { code } = await withReq(payload, (req) =>
			issueHandoverCode(req, order, { regenerate: false }),
		);

		const events = await payload.find({ collection: "order-events" });
		expect(events.docs.length).toBeGreaterThan(0);
		for (const event of events.docs) {
			expect(JSON.stringify(event)).not.toContain(code);
		}
	});

	it("the regeneration budget is refused when spent, and the order stays shipped with its last code intact", async () => {
		const payload = seed(baseOrder());
		let order = await freshOrder(payload);

		let lastCode = (
			await withReq(payload, (req) =>
				issueHandoverCode(req, order, { regenerate: false }),
			)
		).code;

		for (let i = 0; i < HANDOVER_MAX_REGENERATIONS; i++) {
			order = await freshOrder(payload);
			const result = await withReq(payload, (req) =>
				issueHandoverCode(req, order, { regenerate: true }),
			);
			lastCode = result.code;
		}

		order = await freshOrder(payload);
		expect(canRegenerateHandover(order)).toBe(false);
		await expect(
			withReq(payload, (req) =>
				issueHandoverCode(req, order, { regenerate: true }),
			),
		).rejects.toMatchObject({ code: "order.handoverLocked" });

		const final = await freshOrder(payload);
		expect(final.status).toBe("shipped");
		await expect(
			withReq(payload, (req) =>
				verifyHandoverCode(req, final, lastCode, { actor: COURIER }),
			),
		).resolves.toEqual({ ok: true });
	});

	it("a regeneration resets attempts and clears lockedAt", async () => {
		const payload = seed(
			baseOrder({
				handover: {
					codeHash: "stale",
					attempts: HANDOVER_MAX_ATTEMPTS,
					lockedAt: new Date().toISOString(),
					regenerateCount: 0,
				},
			}),
		);
		const order = await freshOrder(payload);

		await withReq(payload, (req) =>
			issueHandoverCode(req, order, { regenerate: true }),
		);

		const stored = await freshOrder(payload);
		expect(stored.handover?.attempts).toBe(0);
		expect(stored.handover?.lockedAt ?? null).toBeNull();
	});
});

describe("verifyHandoverCode", () => {
	it("locks at the fifth wrong attempt, writing order.handover_locked once", async () => {
		const payload = seed(baseOrder());
		const order = await freshOrder(payload);
		await withReq(payload, (req) =>
			issueHandoverCode(req, order, { regenerate: false }),
		);

		for (let i = 0; i < HANDOVER_MAX_ATTEMPTS - 1; i++) {
			const current = await freshOrder(payload);
			await expect(
				withReq(payload, (req) =>
					verifyHandoverCode(req, current, "0000", { actor: COURIER }),
				),
			).rejects.toMatchObject({ code: "order.handoverCodeInvalid" });
		}

		const beforeFifth = await freshOrder(payload);
		await expect(
			withReq(payload, (req) =>
				verifyHandoverCode(req, beforeFifth, "0000", { actor: COURIER }),
			),
		).rejects.toMatchObject({ code: "order.handoverLocked" });

		const locked = await freshOrder(payload);
		expect(locked.handover?.lockedAt).toBeTruthy();
		expect(locked.status).toBe("shipped");

		const events = await payload.find({
			collection: "order-events",
			where: { type: { equals: "order.handover_locked" } },
		});
		expect(events.docs.length).toBe(1);
	});

	it("verifyHandoverCode accepts a courier actor and records it", async () => {
		const payload = seed(baseOrder());
		const order = await freshOrder(payload);
		await withReq(payload, (req) =>
			issueHandoverCode(req, order, { regenerate: false }),
		);
		const issued = await freshOrder(payload);

		await expect(
			withReq(payload, (req) =>
				verifyHandoverCode(req, issued, "0000", {
					actor: COURIER,
					shipmentId: "shp-1",
				}),
			),
		).rejects.toMatchObject({ code: "order.handoverCodeInvalid" });

		const events = await payload.find({
			collection: "order-events",
			where: { type: { equals: "order.handover_failed_attempt" } },
		});
		expect(events.docs).toHaveLength(1);
		expect(events.docs[0]?.actorType).toBe("courier");
		expect(events.docs[0]?.actor).toBe("courier-9");
	});

	it("at most twenty guesses are possible per order", () => {
		const totalCodes = HANDOVER_MAX_REGENERATIONS + 1;
		const totalGuesses = totalCodes * HANDOVER_MAX_ATTEMPTS;
		expect(totalCodes).toBe(4);
		expect(HANDOVER_MAX_ATTEMPTS).toBe(5);
		expect(totalGuesses).toBe(20);
	});
});
