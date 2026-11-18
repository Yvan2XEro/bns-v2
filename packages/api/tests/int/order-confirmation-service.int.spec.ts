// @vitest-environment node
import type { PayloadRequest } from "payload";
import { beforeEach, describe, expect, it, vi } from "vitest";

const sendSms = vi.fn();
vi.mock("../../src/services/smsProvider", () => ({
	sendSms: (...args: unknown[]) => sendSms(...args),
}));

import { CONFIRMATION_CODE_LENGTH } from "../../src/lib/orderCodes";
import { withTransaction } from "../../src/lib/transactions";
import type { Order } from "../../src/payload-types";
import {
	canResendConfirmation,
	issueConfirmationCode,
	verifyConfirmationCode,
} from "../../src/services/orders/confirmation";
import { fakePayload } from "./helpers/fakePayload";

const NOW = new Date("2026-10-01T10:00:00.000Z");

function baseOrder(
	overrides: Record<string, unknown> = {},
): Record<string, unknown> {
	return {
		id: "order-1",
		orderNumber: "BNS-2610-000001",
		shop: "shop-1",
		status: "placed",
		paymentMethod: "cod",
		paymentStatus: "unpaid",
		delivery: { recipientName: "Aicha", phone: "+237600000099" },
		amounts: { total: 15000, currency: "XAF" },
		contract: { locale: "fr" },
		confirmation: {},
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

beforeEach(() => {
	sendSms.mockReset();
	sendSms.mockResolvedValue({ status: "sent" });
});

describe("issueConfirmationCode", () => {
	it("issues a six-digit code, stores only its hash, and returns the plaintext once", async () => {
		const payload = seed(baseOrder());
		const order = await freshOrder(payload);

		const result = await withReq(payload, (req) =>
			issueConfirmationCode(req, order, { resend: false }),
		);

		expect(result.code).toMatch(/^\d{6}$/);
		expect(result.code.length).toBe(CONFIRMATION_CODE_LENGTH);

		const stored = await freshOrder(payload);
		expect(stored.confirmation?.codeHash).toBeTruthy();
		expect(stored.confirmation?.codeHash).not.toBe(result.code);
		// The stored hash is not the code, and nothing else on the order is
		// either: a plaintext field added anywhere in `confirmation` would
		// turn up here.
		expect(JSON.stringify(stored.confirmation)).not.toContain(result.code);
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
			issueConfirmationCode(req, order, { resend: false }),
		);

		expect(sendSms).toHaveBeenCalledTimes(1);
		expect(calls).toEqual(["commit", "sms"]);
	});

	it("never calls sendSms when the transaction rolls back", async () => {
		const payload = seed(baseOrder());
		const order = await freshOrder(payload);

		await expect(
			withReq(payload, async (req) => {
				await issueConfirmationCode(req, order, { resend: false });
				throw new Error("boom");
			}),
		).rejects.toThrow("boom");

		expect(sendSms).not.toHaveBeenCalled();
		const stored = await freshOrder(payload);
		expect(stored.confirmation?.codeHash ?? null).toBeNull();
	});

	it("no event's metadata carries the code", async () => {
		const payload = seed(baseOrder());
		const order = await freshOrder(payload);
		const { code } = await withReq(payload, (req) =>
			issueConfirmationCode(req, order, { resend: false }),
		);

		const events = await payload.find({ collection: "order-events" });
		expect(events.docs.length).toBeGreaterThan(0);
		for (const event of events.docs) {
			expect(JSON.stringify(event)).not.toContain(code);
		}
	});

	it("a resend is refused inside sixty seconds", async () => {
		const payload = seed(
			baseOrder({
				confirmation: {
					sentAt: new Date(Date.now() - 30_000).toISOString(),
					resendCount: 0,
				},
			}),
		);
		const order = await freshOrder(payload);

		await expect(
			withReq(payload, (req) =>
				issueConfirmationCode(req, order, { resend: true }),
			),
		).rejects.toMatchObject({ code: "order.codeResendLimit" });
	});

	it("a resend is refused after the third", async () => {
		const payload = seed(
			baseOrder({
				confirmation: {
					sentAt: new Date(Date.now() - 120_000).toISOString(),
					resendCount: 3,
				},
			}),
		);
		const order = await freshOrder(payload);

		await expect(
			withReq(payload, (req) =>
				issueConfirmationCode(req, order, { resend: true }),
			),
		).rejects.toMatchObject({ code: "order.codeResendLimit" });
	});

	it("a resend replaces the hash, so the code in the old SMS stops working", async () => {
		const payload = seed(baseOrder());
		const order = await freshOrder(payload);
		const first = await withReq(payload, (req) =>
			issueConfirmationCode(req, order, { resend: false }),
		);

		await payload.update({
			collection: "orders",
			id: "order-1",
			overrideAccess: true,
			data: {
				confirmation: {
					...(await freshOrder(payload)).confirmation,
					sentAt: new Date(Date.now() - 120_000).toISOString(),
				},
			},
		});
		const afterFirst = await freshOrder(payload);
		const second = await withReq(payload, (req) =>
			issueConfirmationCode(req, afterFirst, { resend: true }),
		);
		expect(second.code).not.toBe(first.code);

		const afterSecond = await freshOrder(payload);
		await expect(
			withReq(payload, (req) =>
				verifyConfirmationCode(req, afterSecond, first.code),
			),
		).rejects.toMatchObject({ code: "order.confirmationCodeInvalid" });

		const afterFailedAttempt = await freshOrder(payload);
		await expect(
			withReq(payload, (req) =>
				verifyConfirmationCode(req, afterFailedAttempt, second.code),
			),
		).resolves.toEqual({ ok: true });
	});
});

describe("verifyConfirmationCode", () => {
	it("a wrong confirmation code increments attempts and still fails the request", async () => {
		const payload = seed(baseOrder());
		const order = await freshOrder(payload);
		await withReq(payload, (req) =>
			issueConfirmationCode(req, order, { resend: false }),
		);
		const issued = await freshOrder(payload);

		await expect(
			withReq(payload, (req) => verifyConfirmationCode(req, issued, "000000")),
		).rejects.toMatchObject({ code: "order.confirmationCodeInvalid" });

		const stored = await freshOrder(payload);
		expect(stored.confirmation?.attempts).toBe(1);
	});

	it("the fifth wrong confirmation code answers phone.tooManyAttempts and the right code after it also fails", async () => {
		const payload = seed(baseOrder());
		const order = await freshOrder(payload);
		const { code } = await withReq(payload, (req) =>
			issueConfirmationCode(req, order, { resend: false }),
		);

		for (let i = 0; i < 4; i++) {
			const current = await freshOrder(payload);
			await expect(
				withReq(payload, (req) =>
					verifyConfirmationCode(req, current, "000000"),
				),
			).rejects.toMatchObject({ code: "order.confirmationCodeInvalid" });
		}

		const fourthDone = await freshOrder(payload);
		expect(fourthDone.confirmation?.attempts).toBe(4);

		await expect(
			withReq(payload, (req) =>
				verifyConfirmationCode(req, fourthDone, "000000"),
			),
		).rejects.toMatchObject({ code: "phone.tooManyAttempts" });

		const locked = await freshOrder(payload);
		await expect(
			withReq(payload, (req) => verifyConfirmationCode(req, locked, code)),
		).rejects.toMatchObject({ code: "phone.tooManyAttempts" });
	});

	it("an expired code answers confirmationCodeExpired even when it is the right code", async () => {
		const payload = seed(baseOrder());
		const order = await freshOrder(payload);
		const { code } = await withReq(payload, (req) =>
			issueConfirmationCode(req, order, { resend: false }),
		);
		const issued = await freshOrder(payload);
		await payload.update({
			collection: "orders",
			id: "order-1",
			overrideAccess: true,
			data: {
				confirmation: {
					...issued.confirmation,
					codeExpiresAt: new Date(NOW.getTime() - 1000).toISOString(),
				},
			},
		});
		const expired = await freshOrder(payload);

		await expect(
			withReq(payload, (req) => verifyConfirmationCode(req, expired, code)),
		).rejects.toMatchObject({ code: "order.confirmationCodeExpired" });
	});

	it("when no code was ever issued — the buyer's own verified phone, auto-confirmed at placement — verifying answers confirmationCodeInvalid rather than crashing", async () => {
		const payload = seed(
			baseOrder({
				confirmation: {
					method: "verified_phone",
					confirmedAt: NOW.toISOString(),
				},
			}),
		);
		const order = await freshOrder(payload);

		await expect(
			withReq(payload, (req) => verifyConfirmationCode(req, order, "123456")),
		).rejects.toMatchObject({ code: "order.confirmationCodeInvalid" });
		expect(sendSms).not.toHaveBeenCalled();
	});
});

describe("canResendConfirmation", () => {
	it("follows Task 4's canResend over the order's confirmation group", async () => {
		const recentlySent = await freshOrder(
			seed(
				baseOrder({
					confirmation: { sentAt: NOW.toISOString(), resendCount: 0 },
				}),
			),
		);
		expect(
			canResendConfirmation(recentlySent, new Date(NOW.getTime() + 1000)),
		).toBe(false);

		const longAgo = await freshOrder(
			seed(
				baseOrder({
					confirmation: {
						sentAt: new Date(NOW.getTime() - 120_000).toISOString(),
						resendCount: 0,
					},
				}),
			),
		);
		expect(canResendConfirmation(longAgo, NOW)).toBe(true);
	});
});
