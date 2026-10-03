import type { Payload, PayloadRequest } from "payload";
import { getOrderSettings } from "../lib/orderSettings";
import { getPaymentSettings } from "../lib/paymentSettings";
import { relationId } from "../lib/relationId";
import {
	commitContextOf,
	onCommit,
	withTransaction,
} from "../lib/transactions";
import type {
	LedgerTransaction,
	Order,
	OrderEvent,
	PaymentIntent,
} from "../payload-types";
import { issueBuyerFeeInvoice } from "./buyerFeeInvoices";
import { CHECKOUT_MAX_ATTEMPTS } from "./checkoutPayment";
import { type LedgerSourceType, postingFor, postLedger } from "./ledger";
import { cancelByPaymentExpiry } from "./orders/acceptance";
import { registerOrderEventHandler } from "./orders/events";
import { applyTransition } from "./orders/transitions";
import {
	notifyOrderPaid,
	notifyPaymentFailed,
	notifyPaymentSucceeded,
	type PaymentNotice,
} from "./paymentNotifications";
import type { StatusSource } from "./payments";
import { type RefundReason, requestRefund } from "./refunds";

/** Carried by every write this module makes outside `applyTransition` and the ledger. */
export const CHECKOUT_SETTLEMENT_CONTEXT = {
	checkoutSettlement: true,
} as const;

/** When and how the outcome being settled was reported. */
export interface CheckoutReport {
	source: StatusSource;
	at: Date;
}

/**
 * - `paid` — the order moved `placed → paid`, its charge posted;
 * - `refunding` — the money was not needed (`duplicate_payment`, or
 *   `late_payment` for a closed intent or a dead order): charge posted
 *   without the order, one refund against the intent;
 * - `retry_allowed` — a failure with attempts and time left, order untouched;
 * - `cancelled` — the final failure or the expiry ended the order;
 * - `unchanged` — already settled, or nothing for this status to do.
 */
export type CheckoutSettlementOutcome =
	| "paid"
	| "refunding"
	| "retry_allowed"
	| "cancelled"
	| "unchanged";

type HistoryEntry = NonNullable<PaymentIntent["statusHistory"]>[number];

/** The outcome is the intent's latest history entry: P0 has just written it. */
function reportOf(intent: PaymentIntent): CheckoutReport {
	const last: HistoryEntry | undefined = intent.statusHistory?.at(-1);
	return {
		source: last?.source ?? "system",
		at: new Date(last?.at ?? intent.updatedAt),
	};
}

const ledgerSourceOf = (source: StatusSource): LedgerSourceType =>
	source === "reconcile" ? "reconciliation-run" : "webhook-event";

function afterCommit(req: PayloadRequest, work: () => Promise<unknown>): void {
	const run = async () => {
		try {
			await work();
		} catch (error) {
			req.payload.logger.error(
				{ err: error },
				"[checkout-settlement] after-commit work failed",
			);
		}
	};
	if (!onCommit(commitContextOf(req), run)) void run();
}

async function loadOrder(req: PayloadRequest, id: string): Promise<Order> {
	return req.payload.findByID({
		collection: "orders",
		id,
		depth: 0,
		overrideAccess: true,
		req,
	});
}

async function orderIntents(
	req: PayloadRequest,
	orderId: string,
): Promise<PaymentIntent[]> {
	const { docs } = await req.payload.find({
		collection: "payment-intents",
		where: {
			and: [
				{ purpose: { equals: "checkout" } },
				{ targetType: { equals: "order" } },
				{ targetId: { equals: orderId } },
			],
		},
		pagination: false,
		limit: 0,
		depth: 0,
		overrideAccess: true,
		req,
	});
	return docs;
}

/** The intent's `charge`, whichever source posted it: the record that its money was handled. */
async function chargeOf(
	req: PayloadRequest,
	intentId: string,
): Promise<LedgerTransaction | null> {
	const { docs } = await req.payload.find({
		collection: "ledger-transactions",
		where: {
			and: [
				{ paymentIntent: { equals: intentId } },
				{ kind: { equals: "charge" } },
			],
		},
		limit: 1,
		depth: 0,
		overrideAccess: true,
		req,
	});
	return docs[0] ?? null;
}

function noticeOf(order: Order, intent: PaymentIntent): PaymentNotice {
	return {
		orderId: String(order.id),
		orderNumber: order.orderNumber,
		intentId: String(intent.id),
		buyerId: relationId(order.buyer),
		shopId: relationId(order.shop),
		amount: intent.amount,
		currency: intent.currency,
	};
}

/**
 * Money moved, so the charge is posted whatever happens to the order. Only
 * the payment that settles the order carries it: a duplicate or a late
 * payment is posted against its intent alone, so it never inflates the
 * order's `seller_pending` — the D′ `release` would pay out — and its refund
 * (intent-scoped, `services/refunds.ts`) nets it on the same footing.
 */
async function postCharge(
	req: PayloadRequest,
	order: Order,
	intent: PaymentIntent,
	report: CheckoutReport,
	settlesOrder: boolean,
): Promise<void> {
	const shop = relationId(order.shop);
	if (!shop)
		throw new Error(`[checkout-settlement] order ${order.id} has no shop`);
	const amounts = order.amounts ?? {};
	const intentId = String(intent.id);
	await postLedger(req, {
		kind: "charge",
		occurredAt: report.at,
		sourceType: ledgerSourceOf(report.source),
		sourceId: intentId,
		currency: intent.currency,
		...(settlesOrder ? { order: String(order.id) } : {}),
		shop,
		paymentIntent: intentId,
		entries: postingFor("charge", {
			buyerTotal: intent.amount,
			destinationAmount: amounts.destinationAmount ?? 0,
			commission: amounts.commission ?? 0,
			commissionVat: amounts.commissionVat ?? 0,
			buyerProtectionFee: amounts.buyerProtectionFee ?? 0,
			buyerProtectionFeeVat: amounts.buyerProtectionFeeVat ?? 0,
		}),
		memo: settlesOrder
			? `intent ${intentId} paid the order`
			: `intent ${intentId} was not needed by the order; refunded`,
	});
}

/**
 * In its own transaction after commit, so a failure never unsettles a paid
 * order. Idempotent per order (Task 22), which is what lets every replayed
 * success call it again as the retry.
 */
function invoiceAfterCommit(
	req: PayloadRequest,
	order: Order,
	intent: PaymentIntent,
): void {
	afterCommit(req, () =>
		withTransaction(req.payload, (invoiceReq) =>
			issueBuyerFeeInvoice(invoiceReq, order, intent),
		),
	);
}

async function settleOrder(
	req: PayloadRequest,
	order: Order,
	intent: PaymentIntent,
	report: CheckoutReport,
): Promise<CheckoutSettlementOutcome> {
	const { acceptHours } = await getOrderSettings(req.payload);
	const acceptBy = new Date(
		report.at.getTime() + acceptHours * 3_600_000,
	).toISOString();
	const { order: paid } = await applyTransition(
		req,
		order,
		{
			status: "paid",
			paymentStatus: "paid",
			set: { deadlines: { ...order.deadlines, acceptBy } },
		},
		{
			// P4's vocabulary has no `order.paid` row yet (see Task 15's
			// decision 3); the transition fields carry the status change.
			type: "order.note_added",
			actorType: "system",
			actor: null,
			visibility: "both",
			reason: "payment_succeeded",
			metadata: {
				intentId: String(intent.id),
				amount: intent.amount,
				currency: intent.currency,
			},
			source: report.source === "webhook" ? "webhook" : "job",
		},
	);
	await postCharge(req, paid, intent, report, true);

	const notice = noticeOf(paid, intent);
	afterCommit(req, () => notifyPaymentSucceeded(req.payload, notice));
	afterCommit(req, () => notifyOrderPaid(req.payload, { ...notice, acceptBy }));
	invoiceAfterCommit(req, paid, intent);
	return "paid";
}

async function refundExtraPayment(
	req: PayloadRequest,
	order: Order,
	intent: PaymentIntent,
	report: CheckoutReport,
	reason: Extract<RefundReason, "duplicate_payment" | "late_payment">,
): Promise<CheckoutSettlementOutcome> {
	await postCharge(req, order, intent, report, false);
	await requestRefund(req, {
		order: String(order.id),
		reason,
		sourceType: "payment-intent",
		sourceId: String(intent.id),
	});
	return "refunding";
}

async function settleSuccess(
	req: PayloadRequest,
	intent: PaymentIntent,
	report: CheckoutReport,
): Promise<CheckoutSettlementOutcome> {
	const intentId = String(intent.id);
	// A replay of a success already handled — the posting is written in the
	// same transaction as everything else it decided. Only the fee invoice is
	// retried, and only for the payment that settled the order.
	const handled = await chargeOf(req, intentId);
	if (handled) {
		const settled = relationId(handled.order);
		if (settled && intent.status === "succeeded") {
			invoiceAfterCommit(req, await loadOrder(req, settled), intent);
		}
		return "unchanged";
	}

	const order = await loadOrder(req, intent.targetId);
	if (intent.status !== "succeeded") {
		return refundExtraPayment(req, order, intent, report, "late_payment");
	}
	if (order.status === "placed" && order.paymentStatus === "awaiting_payment") {
		return settleOrder(req, order, intent, report);
	}
	const paidByAnother = (await orderIntents(req, String(order.id))).some(
		(other) => String(other.id) !== intentId && other.status === "succeeded",
	);
	return refundExtraPayment(
		req,
		order,
		intent,
		report,
		paidByAnother ? "duplicate_payment" : "late_payment",
	);
}

async function settleFailure(
	req: PayloadRequest,
	intent: PaymentIntent,
	final: boolean,
): Promise<CheckoutSettlementOutcome> {
	const order = await loadOrder(req, intent.targetId);
	const payable =
		order.status === "placed" &&
		(order.paymentStatus === "awaiting_payment" ||
			order.paymentStatus === "unpaid");
	if (!payable) return "unchanged";

	if (!final) {
		const { checkoutExpiryMinutes } = await getPaymentSettings(req.payload);
		const placedAt = Date.parse(order.timestamps?.placedAt ?? order.createdAt);
		const attemptsLeft = (intent.attempt ?? 1) < CHECKOUT_MAX_ATTEMPTS;
		const inWindow = Date.now() - placedAt < checkoutExpiryMinutes * 60_000;
		if (attemptsLeft && inWindow) return "retry_allowed";
	}
	// An older attempt ending must not kill the order under a newer one still
	// in flight; that one's own outcome, or `expireOrders`, decides.
	const live = (await orderIntents(req, String(order.id))).some(
		(other) =>
			String(other.id) !== String(intent.id) &&
			(other.status === "created" || other.status === "pending"),
	);
	if (live) return "retry_allowed";

	const { order: cancelled } = await cancelByPaymentExpiry(req, order);
	const notice = noticeOf(cancelled, intent);
	const status = intent.status === "expired" ? "expired" : "failed";
	afterCommit(req, () =>
		notifyPaymentFailed(req.payload, {
			...notice,
			status,
			failureCode: intent.failureCode ?? null,
		}),
	);
	return "cancelled";
}

/**
 * What a checkout intent's outcome does to its order, in the caller's
 * transaction (P0's `applyStatus`, through `PURPOSE_HANDLERS.checkout`).
 * Idempotent: a replayed success finds its own `charge` and writes nothing,
 * and a replayed failure finds the order already moved.
 *
 * - `succeeded` on a payable order: `placed → paid`, `paymentStatus: paid`,
 *   `acceptBy = paidAt + acceptHours`, `charge` posted with the order, then
 *   (after commit) the buyer and the shop notified and the buyer fee
 *   invoice issued;
 * - `succeeded` on an order another intent already paid: `duplicate_payment`;
 *   on an order no longer payable: `late_payment`;
 * - a late success (`lateSuccess` on a closed intent, `failed` included):
 *   `late_payment`. All three post the charge without the order and refund
 *   the intent alone;
 * - `failed`: the order waits while attempts and the checkout window remain,
 *   else `paymentStatus: failed`, cancelled (`payment_expired`), stock
 *   released, buyer notified. `expired` goes straight to that branch;
 *   `cancelled` leaves the order to its other attempts and `expireOrders`.
 */
export async function settleCheckoutIntent(
	req: PayloadRequest,
	intent: PaymentIntent,
	report: CheckoutReport = reportOf(intent),
): Promise<CheckoutSettlementOutcome> {
	if (intent.status === "succeeded" || intent.lateSuccess) {
		return settleSuccess(req, intent, report);
	}
	if (intent.status === "failed") return settleFailure(req, intent, false);
	if (intent.status === "expired") return settleFailure(req, intent, true);
	return "unchanged";
}

/**
 * A provider success whose amount or currency is not the intent's settles
 * nothing (P0 already logged it and left the status alone). Staff get one
 * open `amount_mismatch` per intent to chase.
 */
export async function alertCheckoutAmountMismatch(
	req: PayloadRequest,
	intent: PaymentIntent,
	reported: { amount: number | null; currency: string | null },
): Promise<void> {
	const localId = String(intent.id);
	const { totalDocs } = await req.payload.count({
		collection: "reconciliation-mismatches",
		where: {
			and: [
				{ kind: { equals: "amount_mismatch" } },
				{ entityType: { equals: "payment-intent" } },
				{ localId: { equals: localId } },
				{ status: { equals: "open" } },
			],
		},
		overrideAccess: true,
		req,
	});
	if (totalDocs > 0) return;
	const order = await loadOrder(req, intent.targetId).catch(() => null);
	const shop = relationId(order?.shop);
	await req.payload.create({
		collection: "reconciliation-mismatches",
		data: {
			kind: "amount_mismatch",
			entityType: "payment-intent",
			localId,
			...(intent.providerReference
				? { providerId: intent.providerReference }
				: {}),
			expected: { amount: intent.amount, currency: intent.currency },
			actual: reported,
			...(shop ? { shop } : {}),
			status: "open",
		},
		overrideAccess: true,
		context: CHECKOUT_SETTLEMENT_CONTEXT,
		req,
	});
}

// ─── Refund on cancellation ──────────────────────────────────────────────────

/** The refund reason a paid order's death carries. */
export function cancellationRefundReason(
	order: Pick<Order, "cancellation">,
): Extract<
	RefundReason,
	"seller_declined" | "acceptance_timeout" | "order_cancelled"
> {
	if (order.cancellation?.reason === "seller_timeout") {
		return "acceptance_timeout";
	}
	if (order.cancellation?.by === "seller") return "seller_declined";
	return "order_cancelled";
}

/**
 * The registry handler for `order.cancelled` and `order.declined` (a seller's
 * decline and the acceptance timeout write the latter): a paid protected
 * order gets back everything still refundable — its full `buyerTotal` unless
 * part was already refunded. Named, because `dispatchOrderEvent` retries by
 * handler name, and safe to retry: `requestRefund` keeps one live refund per
 * source, here the order.
 */
export async function refundOnOrderCancelled(
	payload: Payload,
	order: Order,
	_event: OrderEvent,
): Promise<void> {
	if (order.paymentMethod !== "mobile_money") return;
	if (
		order.paymentStatus !== "paid" &&
		order.paymentStatus !== "partially_refunded"
	) {
		return;
	}
	await withTransaction(payload, (req) =>
		requestRefund(req, {
			order: String(order.id),
			reason: cancellationRefundReason(order),
			sourceType: "order",
			sourceId: String(order.id),
		}),
	);
}

/** Exported so a test that resets the registry can restore it. */
export function registerCheckoutSettlementHandlers(): () => void {
	const offCancelled = registerOrderEventHandler(
		"order.cancelled",
		refundOnOrderCancelled,
	);
	const offDeclined = registerOrderEventHandler(
		"order.declined",
		refundOnOrderCancelled,
	);
	return () => {
		offCancelled();
		offDeclined();
	};
}

registerCheckoutSettlementHandlers();
