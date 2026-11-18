import type { Payload, PayloadRequest, Where } from "payload";
import {
	CHARGE_BLOCKING_HOLD_REASONS,
	type PayoutHoldReason,
} from "../collections/PayoutHolds";
import { relationId } from "../lib/relationId";
import {
	commitContextOf,
	onCommit,
	withTransaction,
} from "../lib/transactions";
import type { Order, PayoutHold } from "../payload-types";
import { notifyPayoutHoldReleased } from "./paymentNotifications";

/** Every write below carries this so the collection hooks know the origin. */
export const PAYOUT_HOLD_CONTEXT = { payoutHoldService: true } as const;

export type PayoutHoldScope = PayoutHold["scope"];
export type PayoutHoldCategory = "security" | "review" | "operations";

const REASON_CATEGORY: Record<PayoutHoldReason, PayoutHoldCategory> = {
	payout_account_changed: "security",
	fraud_signal: "security",
	moderation: "review",
	dispute_open: "review",
	return_open: "review",
	shop_suspended: "review",
	reconciliation_mismatch: "operations",
	payout_failed_repeatedly: "operations",
};

/** What a seller may be told about a hold: the category, never the rule. */
export function holdReasonCategory(
	reason: PayoutHoldReason,
): PayoutHoldCategory {
	return REASON_CATEGORY[reason];
}

/** True for the reasons whose hold must also refuse new protected checkouts. */
export function reasonBlocksCharges(reason: PayoutHoldReason): boolean {
	return CHARGE_BLOCKING_HOLD_REASONS.includes(reason);
}

export interface CreateHoldInput {
	scope: PayoutHoldScope;
	shop: string;
	order?: string | null;
	reason: PayoutHoldReason;
	until?: Date | string | null;
	/** Ignored for the charge-blocking reasons, which always block. */
	blocksCharges?: boolean;
	createdByType: PayoutHold["createdByType"];
	createdBy?: string | null;
	note?: string | null;
}

function holdKey(input: {
	scope: PayoutHoldScope;
	shop: string;
	order?: string | null;
	reason: PayoutHoldReason;
}): Where {
	return {
		and: [
			{ status: { equals: "active" } },
			{ scope: { equals: input.scope } },
			{ shop: { equals: input.shop } },
			{ reason: { equals: input.reason } },
			input.order
				? { order: { equals: input.order } }
				: { order: { exists: false } },
		],
	};
}

/** The active hold `createHold` would hand back for this key, if any. */
export async function findActiveHold(
	req: PayloadRequest,
	key: Pick<CreateHoldInput, "scope" | "shop" | "order" | "reason">,
): Promise<PayoutHold | null> {
	const existing = await req.payload.find({
		collection: "payout-holds",
		depth: 0,
		limit: 1,
		overrideAccess: true,
		req,
		where: holdKey({
			...key,
			order: key.scope === "order" ? (key.order ?? null) : null,
		}),
	});
	return existing.docs[0] ?? null;
}

const isoOrNull = (value: Date | string | null | undefined): string | null =>
	value ? new Date(value).toISOString() : null;

/**
 * Idempotent per `{scope, shop, order, reason}` while a hold is active: the
 * existing row comes back untouched, so a replayed trigger never stacks holds.
 * Once released or expired, the next call opens a new one.
 */
export async function createHold(
	req: PayloadRequest,
	input: CreateHoldInput,
): Promise<PayoutHold> {
	const { payload } = req;
	const order = input.scope === "order" ? (input.order ?? null) : null;
	const existing = await findActiveHold(req, { ...input, order });
	if (existing) return existing;

	return payload.create({
		collection: "payout-holds",
		overrideAccess: true,
		context: PAYOUT_HOLD_CONTEXT,
		req,
		data: {
			scope: input.scope,
			shop: input.shop,
			...(order ? { order } : {}),
			reason: input.reason,
			blocksCharges:
				reasonBlocksCharges(input.reason) || input.blocksCharges === true,
			status: "active",
			until: isoOrNull(input.until),
			createdByType: input.createdByType,
			...(input.createdBy ? { createdBy: input.createdBy } : {}),
			...(input.note ? { note: input.note } : {}),
		},
	});
}

/** Releasing a hold that is no longer active returns it unchanged. */
export async function releaseHold(
	req: PayloadRequest,
	holdId: string,
	input: { releasedBy?: string | null; note?: string | null } = {},
): Promise<PayoutHold> {
	const { payload } = req;
	const hold = await payload.findByID({
		collection: "payout-holds",
		id: holdId,
		depth: 0,
		overrideAccess: true,
		req,
	});
	if (hold.status !== "active") return hold;
	const note = input.note?.trim();
	return payload.update({
		collection: "payout-holds",
		id: holdId,
		overrideAccess: true,
		context: PAYOUT_HOLD_CONTEXT,
		req,
		data: {
			status: "released",
			releasedAt: new Date().toISOString(),
			...(input.releasedBy ? { releasedBy: input.releasedBy } : {}),
			...(note ? { note: hold.note ? `${hold.note}\n${note}` : note } : {}),
		},
	});
}

/**
 * Without `order`: every active hold on the shop, both scopes. With `order`:
 * the holds that keep that order's money where it is — the shop's own holds
 * and the order's, never another order's.
 */
export async function activeHolds(
	payload: Payload,
	filter: { shop: string; order?: string | null },
	req?: PayloadRequest,
): Promise<PayoutHold[]> {
	const scoped: Where[] = filter.order
		? [
				{
					or: [
						{ scope: { equals: "shop" } },
						{ order: { equals: filter.order } },
					],
				},
			]
		: [];
	const result = await payload.find({
		collection: "payout-holds",
		depth: 0,
		limit: 0,
		pagination: false,
		overrideAccess: true,
		req,
		sort: "createdAt",
		where: {
			and: [
				{ shop: { equals: filter.shop } },
				{ status: { equals: "active" } },
				...scoped,
			],
		},
	});
	return result.docs;
}

/**
 * Only a shop-scoped hold refuses checkouts. An order hold stops that order's
 * payout and nothing else: the first-orders rule puts a `fraud_signal` hold on
 * each of a new shop's first three orders, and counting those here would stop
 * the shop taking its second order until the first completed.
 */
export async function hasBlockingHold(
	payload: Payload,
	shop: string,
	req?: PayloadRequest,
): Promise<boolean> {
	const { totalDocs } = await payload.count({
		collection: "payout-holds",
		overrideAccess: true,
		req,
		where: {
			and: [
				{ shop: { equals: shop } },
				{ scope: { equals: "shop" } },
				{ status: { equals: "active" } },
				{ blocksCharges: { equals: true } },
			],
		},
	});
	return totalDocs > 0;
}

// ─── Fraud rules ─────────────────────────────────────────────────────────────

export const FRAUD_FIRST_ORDERS = 3;
export const FRAUD_LARGE_ORDER_XAF = 200_000;
export const FRAUD_ORDER_HOLD_HOURS_AFTER_COMPLETION = 72;
export const FRAUD_REFUND_WINDOW_DAYS = 30;
export const FRAUD_REFUND_MIN_ORDERS = 10;
/** Strictly above this share of the window's orders, refunded, holds the shop. */
export const FRAUD_REFUND_RATE_PERCENT = 10;

const HOUR_MS = 3_600_000;
const DAY_MS = 24 * HOUR_MS;

/** A protected order is a mobile-money order whose payment went through. */
const PROTECTED_PAYMENT_STATUSES: Order["paymentStatus"][] = [
	"paid",
	"partially_refunded",
	"refunded",
];

const protectedOrdersOf = (shop: string): Where[] => [
	{ shop: { equals: shop } },
	{ paymentMethod: { equals: "mobile_money" } },
	{ paymentStatus: { in: PROTECTED_PAYMENT_STATUSES } },
];

const isProtected = (order: Order) =>
	order.paymentMethod === "mobile_money" &&
	PROTECTED_PAYMENT_STATUSES.includes(order.paymentStatus);

export type FraudTrigger =
	/** A protected order was paid: the first-orders and large-order rule. */
	| { event: "order.paid"; orderId: string }
	/** The order completed: its first-orders hold now ends 72 h later. */
	| { event: "order.completed"; orderId: string }
	/** A refund was created or settled on one of the shop's orders. */
	| { event: "refund"; shopId: string };

/**
 * The spec's fixed fraud rules, evaluated on the event that can change their
 * verdict. Returns the holds this evaluation placed or changed (an idempotent
 * re-evaluation returns the existing hold).
 */
export async function applyFraudRules(
	req: PayloadRequest,
	trigger: FraudTrigger,
): Promise<PayoutHold[]> {
	switch (trigger.event) {
		case "order.paid":
			return firstOrdersRule(req, trigger.orderId);
		case "order.completed":
			return scheduleFirstOrdersHoldEnd(req, trigger.orderId);
		case "refund":
			return refundRateRule(req, trigger.shopId);
	}
}

async function readOrder(req: PayloadRequest, id: string): Promise<Order> {
	return req.payload.findByID({
		collection: "orders",
		id,
		depth: 0,
		overrideAccess: true,
		req,
	});
}

async function firstOrdersRule(
	req: PayloadRequest,
	orderId: string,
): Promise<PayoutHold[]> {
	const order = await readOrder(req, orderId);
	const shop = relationId(order.shop);
	if (!shop || !isProtected(order)) return [];

	const large = (order.amounts?.total ?? 0) >= FRAUD_LARGE_ORDER_XAF;
	let early = false;
	if (!large) {
		const { totalDocs: before } = await req.payload.count({
			collection: "orders",
			overrideAccess: true,
			req,
			where: {
				and: [
					...protectedOrdersOf(shop),
					{ id: { not_equals: order.id } },
					{ createdAt: { less_than: order.createdAt } },
				],
			},
		});
		early = before < FRAUD_FIRST_ORDERS;
	}
	if (!large && !early) return [];

	// Ends at completion + 72 h, which `order.completed` fills in.
	return [
		await createHold(req, {
			scope: "order",
			shop,
			order: String(order.id),
			reason: "fraud_signal",
			until: null,
			createdByType: "system",
		}),
	];
}

async function scheduleFirstOrdersHoldEnd(
	req: PayloadRequest,
	orderId: string,
): Promise<PayoutHold[]> {
	const order = await readOrder(req, orderId);
	const completedAt = order.timestamps?.completedAt
		? Date.parse(order.timestamps.completedAt)
		: Date.now();
	const until = new Date(
		completedAt + FRAUD_ORDER_HOLD_HOURS_AFTER_COMPLETION * HOUR_MS,
	).toISOString();

	const open = await req.payload.find({
		collection: "payout-holds",
		depth: 0,
		limit: 0,
		pagination: false,
		overrideAccess: true,
		req,
		where: {
			and: [
				{ order: { equals: String(order.id) } },
				{ scope: { equals: "order" } },
				{ reason: { equals: "fraud_signal" } },
				{ status: { equals: "active" } },
				{ createdByType: { equals: "system" } },
				{ until: { exists: false } },
			],
		},
	});
	const updated: PayoutHold[] = [];
	for (const hold of open.docs) {
		updated.push(
			await req.payload.update({
				collection: "payout-holds",
				id: hold.id,
				overrideAccess: true,
				context: PAYOUT_HOLD_CONTEXT,
				req,
				data: { until },
			}),
		);
	}
	return updated;
}

export interface ShopRefundRate {
	windowDays: number;
	/** Protected orders created in the window. */
	orders: number;
	/** Of those, the ones with at least one refund that did not fail. */
	refundedOrders: number;
}

/** The refund-rate rule's own inputs, also what staff see on the shop sheet. */
export async function shopRefundRate(
	payload: Payload,
	shop: string,
	req?: PayloadRequest,
): Promise<ShopRefundRate> {
	const since = new Date(
		Date.now() - FRAUD_REFUND_WINDOW_DAYS * DAY_MS,
	).toISOString();
	const recent = await payload.find({
		collection: "orders",
		depth: 0,
		limit: 0,
		pagination: false,
		overrideAccess: true,
		req,
		where: {
			and: [
				...protectedOrdersOf(shop),
				{ createdAt: { greater_than_equal: since } },
			],
		},
	});
	const orderIds = recent.docs.map((order) => String(order.id));
	const refunds = orderIds.length
		? await payload.find({
				collection: "refunds",
				depth: 0,
				limit: 0,
				pagination: false,
				overrideAccess: true,
				req,
				where: {
					and: [
						{ order: { in: orderIds } },
						{ status: { not_equals: "failed" } },
					],
				},
			})
		: { docs: [] };
	return {
		windowDays: FRAUD_REFUND_WINDOW_DAYS,
		orders: orderIds.length,
		refundedOrders: new Set(
			refunds.docs.map((refund) => relationId(refund.order)),
		).size,
	};
}

async function refundRateRule(
	req: PayloadRequest,
	shop: string,
): Promise<PayoutHold[]> {
	const rate = await shopRefundRate(req.payload, shop, req);
	if (rate.orders < FRAUD_REFUND_MIN_ORDERS) return [];
	// Integer comparison: refunded / orders > 10 %.
	if (rate.refundedOrders * 100 <= rate.orders * FRAUD_REFUND_RATE_PERCENT)
		return [];

	return [
		await createHold(req, {
			scope: "shop",
			shop,
			reason: "fraud_signal",
			until: null,
			createdByType: "system",
		}),
	];
}

// ─── Expiry ──────────────────────────────────────────────────────────────────

/**
 * Active holds whose `until` has passed become `expired` and the owner is told,
 * by category. A hold with no `until` lasts until someone releases it. Each
 * hold is re-read in its own transaction so a release landing between the
 * candidate read and the write is not overwritten.
 */
export async function expirePayoutHolds(
	payload: Payload,
	now: Date = new Date(),
): Promise<{ expired: string[] }> {
	const due = await payload.find({
		collection: "payout-holds",
		depth: 0,
		limit: 100,
		overrideAccess: true,
		sort: "until",
		where: {
			and: [
				{ status: { equals: "active" } },
				{ until: { less_than_equal: now.toISOString() } },
			],
		},
	});

	const expired: string[] = [];
	for (const candidate of due.docs) {
		const acted = await withTransaction(payload, async (req) => {
			const hold = await payload
				.findByID({
					collection: "payout-holds",
					id: candidate.id,
					depth: 0,
					overrideAccess: true,
					req,
				})
				.catch(() => null);
			if (
				!hold ||
				hold.status !== "active" ||
				!hold.until ||
				Date.parse(hold.until) > now.getTime()
			) {
				return false;
			}
			await payload.update({
				collection: "payout-holds",
				id: hold.id,
				overrideAccess: true,
				context: PAYOUT_HOLD_CONTEXT,
				req,
				data: { status: "expired" },
			});
			const shopId = relationId(hold.shop);
			const shop = shopId
				? await payload
						.findByID({
							collection: "shops",
							id: shopId,
							depth: 0,
							overrideAccess: true,
							req,
						})
						.catch(() => null)
				: null;
			if (shop) {
				onCommit(commitContextOf(req), () =>
					notifyPayoutHoldReleased(shop, {
						holdId: String(hold.id),
						scope: hold.scope,
						orderId: relationId(hold.order),
						category: holdReasonCategory(hold.reason),
						cause: "expired",
					}),
				);
			}
			return true;
		});
		if (acted) expired.push(String(candidate.id));
	}
	return { expired };
}
