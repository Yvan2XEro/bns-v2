// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

type TriggerCall = {
	event: string;
	subscriberId: string;
	payload: Record<string, unknown>;
};

const { triggerNotificationEvent, sendSms, providerConfigured } = vi.hoisted(
	() => ({
		triggerNotificationEvent: vi.fn(async (_args: TriggerCall) => undefined),
		sendSms: vi.fn(async (_payload: unknown, _message: unknown) => undefined),
		providerConfigured: { value: true },
	}),
);

vi.mock("../../src/hooks/notificationEvents", () => ({
	triggerNotificationEvent,
}));
vi.mock("../../src/services/notificationProvider", async (importOriginal) => ({
	...(await importOriginal<
		typeof import("../../src/services/notificationProvider")
	>()),
	isNotificationProviderConfigured: () => providerConfigured.value,
}));
vi.mock("../../src/services/smsProvider", () => ({ sendSms }));

import { gsm7Length, isGsm7 } from "../../src/services/orders/sms";
import {
	notifyConnectedAccountLost,
	notifyOrderPaid,
	notifyPaymentFailed,
	notifyPaymentSucceeded,
	notifyPaymentsOnboardingAction,
	notifyPayoutAccountActivated,
	notifyPayoutAccountChanged,
	notifyPayoutAccountReview,
	notifyPayoutFailed,
	notifyPayoutHoldPlaced,
	notifyPayoutHoldReleased,
	notifyPayoutSent,
	notifyReceivableWrittenOff,
	notifyRefundCompleted,
	notifyRefundFailed,
	notifyRefundInitiated,
	notifyRefundStaffAlert,
	payoutAccountChangedSms,
} from "../../src/services/paymentNotifications";
import { fakePayload } from "./helpers/fakePayload";

const seed = () =>
	fakePayload({
		users: [
			{
				id: "u-owner",
				role: "user",
				phone: "+237670000001",
				phoneVerifiedAt: "2026-09-01T00:00:00.000Z",
			},
			{ id: "u-manager", role: "user" },
			{ id: "u-staff", role: "user" },
			{ id: "u-buyer", role: "user" },
			{ id: "u-admin-1", role: "admin" },
			{ id: "u-admin-2", role: "admin" },
		],
		shops: [
			{
				id: "s-1",
				name: "Akwa Tech",
				owner: "u-owner",
				status: "active",
				level: 2,
			},
		],
		"shop-members": [
			{
				id: "m-1",
				shop: "s-1",
				user: "u-owner",
				role: "owner",
				status: "active",
			},
			{
				id: "m-2",
				shop: "s-1",
				user: "u-manager",
				role: "manager",
				status: "active",
			},
			{
				id: "m-3",
				shop: "s-1",
				user: "u-staff",
				role: "staff",
				status: "active",
			},
		],
		orders: [{ id: "o-1", orderNumber: "BNS-0001", shop: "s-1" }],
	});

const SHOP = { id: "s-1", name: "Akwa Tech", owner: "u-owner" };
const calls = () => triggerNotificationEvent.mock.calls.map(([call]) => call);

beforeEach(() => {
	triggerNotificationEvent.mockClear();
	sendSms.mockClear();
	sendSms.mockImplementation(async () => undefined);
	providerConfigured.value = true;
});

const payment = {
	orderId: "o-1",
	orderNumber: "BNS-0001",
	intentId: "pi-1",
	buyerId: "u-buyer",
	shopId: "s-1",
	amount: 25_750,
	currency: "XAF",
};

describe("checkout settlement notices", () => {
	it("payment-succeeded reaches the buyer with the order and the amount", async () => {
		await notifyPaymentSucceeded(seed(), payment);
		expect(calls()).toEqual([
			{
				event: "payment-succeeded",
				subscriberId: "u-buyer",
				payload: {
					orderId: "o-1",
					orderNumber: "BNS-0001",
					amount: 25_750,
					currency: "XAF",
				},
			},
		]);
	});

	it("payment-failed carries the status and the failure code", async () => {
		await notifyPaymentFailed(seed(), {
			...payment,
			status: "expired",
			failureCode: null,
		});
		expect(calls()).toEqual([
			{
				event: "payment-failed",
				subscriberId: "u-buyer",
				payload: {
					orderId: "o-1",
					orderNumber: "BNS-0001",
					amount: 25_750,
					currency: "XAF",
					status: "expired",
					failureCode: null,
				},
			},
		]);
	});

	it("order-paid reaches the owner and the manager, not the staff member", async () => {
		await notifyOrderPaid(seed(), {
			...payment,
			acceptBy: "2026-10-05T10:00:00.000Z",
		});
		const body = {
			orderId: "o-1",
			orderNumber: "BNS-0001",
			amount: 25_750,
			currency: "XAF",
			acceptBy: "2026-10-05T10:00:00.000Z",
		};
		expect(calls()).toEqual([
			{ event: "order-paid", subscriberId: "u-owner", payload: body },
			{ event: "order-paid", subscriberId: "u-manager", payload: body },
		]);
	});

	it("sends nothing when Novu is not configured", async () => {
		providerConfigured.value = false;
		await notifyPaymentSucceeded(seed(), payment);
		await notifyOrderPaid(seed(), { ...payment, acceptBy: "x" });
		expect(triggerNotificationEvent).toHaveBeenCalledTimes(0);
	});
});

const account = {
	shopId: "s-1",
	ownerId: "u-owner",
	accountId: "pa-2",
	method: "mtn_momo" as const,
	accountNumberMasked: "+237 6•• ••• 789",
};

describe("payout-account notices", () => {
	it("payout-account-activated and payout-account-review reach the owner", async () => {
		await notifyPayoutAccountActivated(seed(), account);
		await notifyPayoutAccountReview(seed(), { ...account, result: "partial" });
		const fields = {
			shopId: "s-1",
			accountId: "pa-2",
			method: "mtn_momo",
			accountNumberMasked: "+237 6•• ••• 789",
		};
		expect(calls()).toEqual([
			{
				event: "payout-account-activated",
				subscriberId: "u-owner",
				payload: fields,
			},
			{
				event: "payout-account-review",
				subscriberId: "u-owner",
				payload: { ...fields, result: "partial" },
			},
		]);
	});

	const changed = {
		...account,
		holdHours: 72,
		holdUntil: "2026-10-06T10:00:00.000Z",
		notMeUrl:
			"https://buynsellem.com/seller/payments/setup?shop=652f1c2b9a0e4d0012345678&notMe=652f1c2b9a0e4d0087654321",
	};

	it("payout-account-changed goes through Novu with the not-me link, and by SMS to the verified phone", async () => {
		await notifyPayoutAccountChanged(seed(), changed);
		expect(calls()).toEqual([
			{
				event: "payout-account-changed",
				subscriberId: "u-owner",
				payload: {
					shopId: "s-1",
					accountId: "pa-2",
					method: "mtn_momo",
					accountNumberMasked: "+237 6•• ••• 789",
					holdUntil: "2026-10-06T10:00:00.000Z",
					notMeUrl: changed.notMeUrl,
				},
			},
		]);
		expect(sendSms.mock.calls.map(([, message]) => message)).toEqual([
			{
				to: "+237670000001",
				message: payoutAccountChangedSms(changed.notMeUrl, 72),
			},
		]);
	});

	it("still sends the SMS when Novu is not configured", async () => {
		providerConfigured.value = false;
		await notifyPayoutAccountChanged(seed(), changed);
		expect(triggerNotificationEvent).toHaveBeenCalledTimes(0);
		expect(sendSms).toHaveBeenCalledTimes(1);
	});

	it("sends no SMS to an unverified phone", async () => {
		const payload = seed();
		payload.store.users[0].phoneVerifiedAt = null;
		await notifyPayoutAccountChanged(payload, changed);
		expect(calls().map((c) => c.event)).toEqual(["payout-account-changed"]);
		expect(sendSms).toHaveBeenCalledTimes(0);
	});

	it("an SMS failure is logged, never thrown", async () => {
		const payload = seed();
		sendSms.mockImplementation(async () => {
			throw new Error("gateway down");
		});
		await notifyPayoutAccountChanged(payload, changed);
		expect(payload.logger.error).toHaveBeenCalledTimes(1);
	});

	it("the SMS is GSM-7, carries the whole link, and fits in two parts", () => {
		const text = payoutAccountChangedSms(changed.notMeUrl, 72);
		expect(isGsm7(text)).toBe(true);
		expect(text.endsWith(changed.notMeUrl)).toBe(true);
		expect(gsm7Length(text)).toBeLessThanOrEqual(306);
		expect(gsm7Length(text)).toBeGreaterThan(160);
	});
});

describe("the hold pair carries the category, never the rule", () => {
	it("payout-hold-placed", async () => {
		await notifyPayoutHoldPlaced(SHOP, {
			holdId: "h-1",
			scope: "shop",
			orderId: null,
			category: "operations",
			checkPayoutAccount: true,
		});
		expect(calls()).toEqual([
			{
				event: "payout-hold-placed",
				subscriberId: "u-owner",
				payload: {
					shopId: "s-1",
					shopName: "Akwa Tech",
					holdId: "h-1",
					scope: "shop",
					orderId: null,
					reasonCategory: "operations",
					checkPayoutAccount: true,
				},
			},
		]);
	});

	it("payout-hold-released", async () => {
		await notifyPayoutHoldReleased(SHOP, {
			holdId: "h-1",
			scope: "order",
			orderId: "o-1",
			category: "review",
			cause: "expired",
		});
		expect(calls()).toEqual([
			{
				event: "payout-hold-released",
				subscriberId: "u-owner",
				payload: {
					shopId: "s-1",
					shopName: "Akwa Tech",
					holdId: "h-1",
					scope: "order",
					orderId: "o-1",
					reasonCategory: "review",
					cause: "expired",
				},
			},
		]);
	});

	it("a lost connected account tells the owner `security`, never `fraud_signal`, and the admins the status", async () => {
		await notifyConnectedAccountLost(seed(), {
			shopId: "s-1",
			status: "deauthorized",
		});
		expect(calls()).toEqual([
			{
				event: "payout-hold-placed",
				subscriberId: "u-owner",
				payload: {
					shopId: "s-1",
					shopName: "Akwa Tech",
					holdId: null,
					scope: "shop",
					orderId: null,
					reasonCategory: "security",
					checkPayoutAccount: false,
				},
			},
			...["u-admin-1", "u-admin-2"].map((subscriberId) => ({
				event: "payments-connected-account-lost",
				subscriberId,
				payload: {
					shopId: "s-1",
					shopName: "Akwa Tech",
					status: "deauthorized",
				},
			})),
		]);
		const ownerPayload = JSON.stringify(calls()[0].payload);
		expect(ownerPayload).toContain('"reasonCategory":"security"');
		expect(ownerPayload).not.toContain("fraud");
	});
});

describe("connected-account and payout notices", () => {
	it("payments-onboarding-action reaches the owner with the requirement count", async () => {
		await notifyPaymentsOnboardingAction(seed(), {
			shopId: "s-1",
			status: "restricted",
			requirementsDue: ["individual.id_number", "tos_acceptance"],
		});
		expect(calls()).toEqual([
			{
				event: "payments-onboarding-action",
				subscriberId: "u-owner",
				payload: {
					shopId: "s-1",
					shopName: "Akwa Tech",
					status: "restricted",
					requirementsCount: 2,
				},
			},
		]);
	});

	it("payout-sent and payout-failed reach the owner", async () => {
		const notice = { payoutId: "po-1", amount: 120_000, currency: "XAF" };
		await notifyPayoutSent(SHOP, notice);
		await notifyPayoutFailed(SHOP, notice);
		const body = { shopId: "s-1", ...notice };
		expect(calls()).toEqual([
			{ event: "payout-sent", subscriberId: "u-owner", payload: body },
			{ event: "payout-failed", subscriberId: "u-owner", payload: body },
		]);
	});

	it("payout-receivable-written-off reaches the owner", async () => {
		await notifyReceivableWrittenOff(seed(), {
			shopId: "s-1",
			amount: 4_000,
			currency: "XAF",
			holdId: "h-9",
		});
		expect(calls()).toEqual([
			{
				event: "payout-receivable-written-off",
				subscriberId: "u-owner",
				payload: {
					shopId: "s-1",
					shopName: "Akwa Tech",
					amount: 4_000,
					currency: "XAF",
					holdId: "h-9",
				},
			},
		]);
	});
});

const refund = {
	refundId: "r-1",
	orderId: "o-1",
	buyerId: "u-buyer",
	shopId: "s-1",
	amount: 25_750,
	currency: "XAF",
	reason: "seller_declined",
};
const refundBody = {
	refundId: "r-1",
	orderId: "o-1",
	orderNumber: "BNS-0001",
	amount: 25_750,
	currency: "XAF",
	reason: "seller_declined",
};

describe("refund notices", () => {
	it("refund-initiated reaches the buyer and the owner, each with an audience and their own order screen", async () => {
		await notifyRefundInitiated(seed(), refund);
		expect(calls()).toEqual([
			{
				event: "refund-initiated",
				subscriberId: "u-buyer",
				payload: {
					...refundBody,
					audience: "buyer",
					orderPath: "/purchases/o-1",
				},
			},
			{
				event: "refund-initiated",
				subscriberId: "u-owner",
				payload: {
					...refundBody,
					audience: "shop",
					orderPath: "/seller/orders/o-1",
				},
			},
		]);
	});

	it("refund-completed and refund-failed reach the buyer only", async () => {
		await notifyRefundCompleted(seed(), refund);
		await notifyRefundFailed(seed(), refund);
		expect(calls()).toEqual([
			{
				event: "refund-completed",
				subscriberId: "u-buyer",
				payload: refundBody,
			},
			{ event: "refund-failed", subscriberId: "u-buyer", payload: refundBody },
		]);
	});

	it("the staff alert reaches every admin with the mismatch", async () => {
		await notifyRefundStaffAlert(seed(), {
			...refund,
			mismatchId: "mm-1",
			failureReason: "insufficient_balance",
		});
		const body = {
			refundId: "r-1",
			orderId: "o-1",
			shopId: "s-1",
			amount: 25_750,
			currency: "XAF",
			reason: "seller_declined",
			mismatchId: "mm-1",
			failureReason: "insufficient_balance",
		};
		expect(calls()).toEqual([
			{
				event: "payments-refund-staff-alert",
				subscriberId: "u-admin-1",
				payload: body,
			},
			{
				event: "payments-refund-staff-alert",
				subscriberId: "u-admin-2",
				payload: body,
			},
		]);
	});
});
