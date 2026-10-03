import type { Payload, PayloadRequest, Where } from "payload";
import type { PAYOUT_STATUSES } from "../collections/Payouts";
import { roundXaf } from "../lib/paymentMath";
import {
	getPaymentSettings,
	type PaymentSettings,
	type ReleaseModel,
} from "../lib/paymentSettings";
import type {
	MarketplaceProvider,
	TransferEvent,
} from "../lib/payments/marketplace";
import { getMarketplaceProvider } from "../lib/payments/marketplaceRegistry";
import { relationId } from "../lib/relationId";
import { type CapabilityShop, shopCapabilities } from "../lib/shopCapabilities";
import {
	commitContextOf,
	onCommit,
	withTransaction,
} from "../lib/transactions";
import type {
	LedgerTransaction,
	Order,
	OrderEvent,
	Payout,
	Shop,
} from "../payload-types";
import { issueApplicationFeeCommissionInvoice } from "./buyerFeeInvoices";
import {
	accountBalance,
	type LedgerSourceType,
	orderBalances,
	postingFor,
	postLedger,
	transactionLines,
} from "./ledger";
import { registerOrderEventHandler } from "./orders/events";
import {
	notifyPayoutFailed,
	notifyPayoutHoldPlaced,
	notifyPayoutSent,
} from "./paymentNotifications";
import { activeHolds, createHold, holdReasonCategory } from "./payoutHolds";

/** Every payouts/orders write below carries it, per AGENTS.md's overrideAccess rule. */
export const PAYOUT_CONTEXT = { payoutService: true } as const;

export type PayoutStatus = (typeof PAYOUT_STATUSES)[number];

/** The spec's payouts table. `failed`, `reversed` and `cancelled` are terminal. */
export const PAYOUT_TRANSITIONS: Record<PayoutStatus, readonly PayoutStatus[]> =
	{
		scheduled: ["pending", "cancelled"],
		pending: ["sent", "processing", "complete", "failed"],
		sent: ["processing", "complete", "failed"],
		processing: ["complete", "failed"],
		complete: ["reversed"],
		failed: [],
		reversed: [],
		cancelled: [],
	};

export const canMovePayout = (from: PayoutStatus, to: PayoutStatus) =>
	PAYOUT_TRANSITIONS[from].includes(to);

/** Our reference on `releasePayout`; `RP-` belongs to P8's reseller payouts. */
export const payoutReference = (payoutId: string) => `PO-${payoutId}`;
const PAYOUT_REFERENCE = /^PO-(.+)$/;

export const PAYOUT_FAILURES_BEFORE_HOLD = 3;
export const EARLY_RELEASE_SHARE_PERCENT = 70;
export const EARLY_RELEASE_AFTER_DELIVERED_HOURS = 48;
export const EARLY_RELEASE_MIN_COMPLETED_ORDERS = 30;
/** Strictly below this fraction over the window. */
export const EARLY_RELEASE_MAX_DISPUTE_LOSS = 0.02;
export const EARLY_RELEASE_WINDOW_DAYS = 90;
export const PROVIDER_SCHEDULE_MIN_SHOP_AGE_DAYS = 60;
export const PROVIDER_SCHEDULE_MIN_COD_ORDERS = 10;
/** Strictly below this fraction. */
export const PROVIDER_SCHEDULE_MAX_LOSS = 0.05;
export const PROVIDER_SCHEDULE_EXPOSURE_FACTOR = 0.5;

const HOUR_MS = 3_600_000;
const DAY_MS = 24 * HOUR_MS;

/** Mirrors payoutHolds' definition: a mobile-money order whose payment went through. */
const PROTECTED_PAYMENT_STATUSES: Order["paymentStatus"][] = [
	"paid",
	"partially_refunded",
	"refunded",
];

export interface PayoutDeps {
	settings?: PaymentSettings;
	provider?: MarketplaceProvider;
}

const idOf = (value: unknown): string => relationId(value) ?? "";

async function afterCommit(
	req: PayloadRequest,
	label: string,
	work: () => Promise<void>,
): Promise<void> {
	const guarded = async () => {
		try {
			await work();
		} catch (error) {
			req.payload.logger.error({ err: error }, `[payouts] ${label} failed`);
		}
	};
	if (!onCommit(commitContextOf(req), guarded)) await guarded();
}

async function shopOf(
	payload: Payload,
	shopId: string,
	req?: PayloadRequest,
): Promise<Shop | null> {
	return payload
		.findByID({
			collection: "shops",
			id: shopId,
			depth: 0,
			overrideAccess: true,
			...(req ? { req } : {}),
		})
		.catch(() => null);
}

async function orderTransactions(
	req: PayloadRequest,
	orderId: string,
	kinds: LedgerTransaction["kind"][],
): Promise<LedgerTransaction[]> {
	const { docs } = await req.payload.find({
		collection: "ledger-transactions",
		where: {
			and: [{ order: { equals: orderId } }, { kind: { in: kinds } }],
		},
		pagination: false,
		depth: 0,
		overrideAccess: true,
		req,
	});
	return docs;
}

const currencyOf = (order: Order): string => {
	const currency = order.amounts?.currency;
	if (!currency) throw new Error(`[payouts] order ${order.id} has no currency`);
	return currency;
};

function settlementWith(
	order: Order,
	patch: Partial<NonNullable<Order["settlement"]>>,
): NonNullable<Order["settlement"]> {
	const current = order.settlement ?? {};
	return {
		...current,
		connectedAccount: relationId(current.connectedAccount),
		payout: relationId(current.payout),
		...patch,
	};
}

async function updateSettlement(
	req: PayloadRequest,
	order: Order,
	patch: Partial<NonNullable<Order["settlement"]>>,
): Promise<void> {
	await req.payload.update({
		collection: "orders",
		id: order.id,
		data: { settlement: settlementWith(order, patch) },
		overrideAccess: true,
		context: PAYOUT_CONTEXT,
		req,
	});
}

// ─── Release at `completed` ─────────────────────────────────────────────────

/**
 * Facts about the money that stop the `release` posting itself. Holds and
 * suspension are deliberately absent: they decide whether money may *move*,
 * which is the batch's question, re-asked at every run — so a hold that
 * expires heals at the next run instead of stranding an unposted release.
 */
export type ReleaseBlocker =
	| "not_protected"
	| "not_completed"
	| "no_charge"
	| "balance_mismatch";

export type ReleaseResult =
	| { released: false; blocker: ReleaseBlocker }
	| {
			released: true;
			amount: number;
			commission: number;
			commissionVat: number;
			releaseModel: ReleaseModel;
	  };

async function hasOpenBalanceMismatch(
	req: PayloadRequest,
	order: Order,
): Promise<boolean> {
	const { totalDocs } = await req.payload.count({
		collection: "reconciliation-mismatches",
		where: {
			and: [
				{ kind: { equals: "balance_mismatch" } },
				{ status: { equals: "open" } },
				{
					or: [
						{ shop: { equals: idOf(order.shop) } },
						{ localId: { equals: order.id } },
					],
				},
			],
		},
		overrideAccess: true,
		req,
	});
	return totalDocs > 0;
}

/**
 * C′ split into HT and VAT: the order's frozen commission minus what the
 * refunds still standing on the ledger took back. Cross-checked against the
 * order's `platform_fee_unearned`, the gross C′ the ledger itself holds.
 */
async function netCommission(
	req: PayloadRequest,
	order: Order,
	unearned: number,
): Promise<{ commission: number; commissionVat: number }> {
	const postings = await orderTransactions(req, order.id, [
		"refund_submitted",
		"refund_failed",
	]);
	const failed = new Set(
		postings
			.filter((t) => t.kind === "refund_failed")
			.map((t) => idOf(t.refund)),
	);
	const standing = postings
		.filter((t) => t.kind === "refund_submitted" && !failed.has(idOf(t.refund)))
		.map((t) => idOf(t.refund))
		.filter(Boolean);
	let commission = order.amounts?.commission ?? 0;
	let commissionVat = order.amounts?.commissionVat ?? 0;
	if (standing.length > 0) {
		const { docs } = await req.payload.find({
			collection: "refunds",
			where: { id: { in: standing } },
			pagination: false,
			depth: 0,
			overrideAccess: true,
			req,
		});
		for (const refund of docs) {
			commission -= refund.breakdown?.commission ?? 0;
			commissionVat -= refund.breakdown?.commissionVat ?? 0;
		}
	}
	if (
		commission < 0 ||
		commissionVat < 0 ||
		commission + commissionVat !== unearned
	) {
		throw new Error(
			`[payouts] order ${order.id}: C′ ${commission}+${commissionVat} disagrees with platform_fee_unearned ${unearned}`,
		);
	}
	return { commission, commissionVat };
}

/**
 * The release posting for one completed protected order: D′ (the order's
 * remaining `seller_pending`, net of refunds, a seller-borne fee and an early
 * release) and C′, both read from the ledger, never from the order's gross
 * amounts. Idempotent: keyed on the `order.completed` event, and a replay
 * finds nothing left pending to move.
 */
export async function releaseCompletedOrder(
	payload: Payload,
	orderRef: Pick<Order, "id">,
	event: Pick<OrderEvent, "id">,
	deps: PayoutDeps = {},
): Promise<ReleaseResult> {
	const settings = deps.settings ?? (await getPaymentSettings(payload));
	const result = await withTransaction(payload, async (req) => {
		const order = await payload.findByID({
			collection: "orders",
			id: orderRef.id,
			depth: 0,
			overrideAccess: true,
			req,
		});
		if (order.paymentMethod !== "mobile_money") {
			return { result: { released: false, blocker: "not_protected" } as const };
		}
		if (order.status !== "completed") {
			return { result: { released: false, blocker: "not_completed" } as const };
		}
		const charges = await orderTransactions(req, order.id, ["charge"]);
		if (charges.length === 0) {
			return { result: { released: false, blocker: "no_charge" } as const };
		}
		if (await hasOpenBalanceMismatch(req, order)) {
			return {
				result: { released: false, blocker: "balance_mismatch" } as const,
			};
		}

		const currency = currencyOf(order);
		const shop = idOf(order.shop);
		const releaseModel =
			order.settlement?.releaseModel ?? settings.releaseModel;
		const balances = await orderBalances(req, order.id);
		const amount = balances.seller_pending ?? 0;
		const earned = await orderTransactions(req, order.id, [
			"commission_earned",
		]);
		const net =
			earned.length > 0
				? { commission: 0, commissionVat: 0 }
				: await netCommission(req, order, balances.platform_fee_unearned ?? 0);

		const common = {
			occurredAt: order.timestamps?.completedAt ?? new Date().toISOString(),
			sourceType: "order-event" as const,
			sourceId: event.id,
			currency,
			order: order.id,
			shop,
		};
		if (amount > 0) {
			await postLedger(req, {
				...common,
				kind: "release",
				entries: postingFor("release", { amount, releaseModel }),
			});
		}
		if (net.commission + net.commissionVat > 0) {
			await postLedger(req, {
				...common,
				kind: "commission_earned",
				entries: postingFor("commission_earned", net),
			});
		}
		if (!order.settlement?.releaseEligibleAt) {
			const now = new Date().toISOString();
			await updateSettlement(req, order, {
				releaseEligibleAt: now,
				// Under the fallback model the money is already on the provider's
				// schedule: nothing of ours will release it later.
				...(releaseModel === "provider_schedule" ? { releasedAt: now } : {}),
			});
		}
		return {
			result: {
				released: true,
				amount,
				commission: net.commission,
				commissionVat: net.commissionVat,
				releaseModel,
			} as const,
			order,
		};
	});

	if (!result.result.released) {
		payload.logger.warn(
			{ orderId: orderRef.id, blocker: result.result.blocker },
			"[payouts] release not posted",
		);
		return result.result;
	}
	// Outside the release transaction: an invoice failure must not undo the
	// posting, and the handler's retry re-runs this alone (the postings are
	// keyed). Task 22's function is idempotent per order.
	const order = result.order;
	if (order) {
		await withTransaction(payload, (req) =>
			issueApplicationFeeCommissionInvoice(req, order),
		);
	}
	return result.result;
}

/** The registry handler. Named: `dispatchOrderEvent` retries by handler name. */
export async function releaseOnOrderCompleted(
	payload: Payload,
	order: Order,
	event: OrderEvent,
): Promise<void> {
	if (order.paymentMethod !== "mobile_money") return;
	await releaseCompletedOrder(payload, order, event);
}

/** Exported so a test that resets the registry can restore it. */
export function registerPayoutHandlers(): () => void {
	return registerOrderEventHandler("order.completed", releaseOnOrderCompleted);
}

registerPayoutHandlers();

// ─── Eligibility rules ──────────────────────────────────────────────────────

export interface EarlyReleaseStats {
	completedProtectedOrders: number;
	/** Over the last 90 days, as a fraction (0.02 = 2%). */
	disputeLossRate: number;
}

/** Level 3, ≥ 30 completed protected orders, dispute loss strictly below 2%. */
export function earlyReleaseEligible(
	shop: CapabilityShop,
	stats: EarlyReleaseStats,
	now = new Date(),
): boolean {
	return (
		shopCapabilities(shop, now).fasterPayouts &&
		stats.completedProtectedOrders >= EARLY_RELEASE_MIN_COMPLETED_ORDERS &&
		stats.disputeLossRate < EARLY_RELEASE_MAX_DISPUTE_LOSS
	);
}

/** 70% of D, never more than the order still has pending. */
export function earlyReleaseAmount(
	destinationAmount: number,
	sellerPending: number,
): number {
	return Math.max(
		0,
		Math.min(
			roundXaf((destinationAmount * EARLY_RELEASE_SHARE_PERCENT) / 100),
			sellerPending,
		),
	);
}

/**
 * The dispute loss rate is the share of the shop's protected orders placed in
 * the window that lost money to a dispute (a `dispute` refund not `failed`).
 */
export async function earlyReleaseStats(
	payload: Payload,
	shopId: string,
	now = new Date(),
	req?: PayloadRequest,
): Promise<EarlyReleaseStats> {
	const protectedOrders: Where[] = [
		{ shop: { equals: shopId } },
		{ paymentMethod: { equals: "mobile_money" } },
		{ paymentStatus: { in: PROTECTED_PAYMENT_STATUSES } },
	];
	const { totalDocs: completedProtectedOrders } = await payload.count({
		collection: "orders",
		where: { and: [...protectedOrders, { status: { equals: "completed" } }] },
		overrideAccess: true,
		...(req ? { req } : {}),
	});
	const since = new Date(
		now.getTime() - EARLY_RELEASE_WINDOW_DAYS * DAY_MS,
	).toISOString();
	const { docs: windowOrders } = await payload.find({
		collection: "orders",
		where: {
			and: [...protectedOrders, { createdAt: { greater_than_equal: since } }],
		},
		pagination: false,
		depth: 0,
		overrideAccess: true,
		...(req ? { req } : {}),
	});
	if (windowOrders.length === 0) {
		return { completedProtectedOrders, disputeLossRate: 0 };
	}
	const { docs: losses } = await payload.find({
		collection: "refunds",
		where: {
			and: [
				{ order: { in: windowOrders.map((o) => o.id) } },
				{ reason: { equals: "dispute" } },
				{ status: { not_equals: "failed" } },
			],
		},
		pagination: false,
		depth: 0,
		overrideAccess: true,
		...(req ? { req } : {}),
	});
	const lost = new Set(losses.map((r) => idOf(r.order))).size;
	return {
		completedProtectedOrders,
		disputeLossRate: lost / windowOrders.length,
	};
}

export interface ProviderScheduleStats {
	completedCodOrders: number;
	/** COD refusals plus dispute losses over COD orders with an outcome, as a fraction. */
	codLossRate: number;
}

export type ProviderScheduleRefusal =
	| "shop_too_young"
	| "too_few_cod_orders"
	| "loss_rate_too_high";

/**
 * The fallback model's no-reserve arm: whether the provider offers a rolling
 * reserve is a future adapter's question, so only this arm is implemented.
 */
export function providerScheduleRefusals(
	shop: Pick<Shop, "createdAt">,
	stats: ProviderScheduleStats,
	now = new Date(),
): ProviderScheduleRefusal[] {
	const refusals: ProviderScheduleRefusal[] = [];
	const age = now.getTime() - Date.parse(shop.createdAt);
	if (!(age >= PROVIDER_SCHEDULE_MIN_SHOP_AGE_DAYS * DAY_MS))
		refusals.push("shop_too_young");
	if (stats.completedCodOrders < PROVIDER_SCHEDULE_MIN_COD_ORDERS)
		refusals.push("too_few_cod_orders");
	if (!(stats.codLossRate < PROVIDER_SCHEDULE_MAX_LOSS))
		refusals.push("loss_rate_too_high");
	return refusals;
}

export function providerScheduleEligible(
	shop: Pick<Shop, "createdAt">,
	stats: ProviderScheduleStats,
	now = new Date(),
): boolean {
	return providerScheduleRefusals(shop, stats, now).length === 0;
}

/** Refusals are `cod_refused` orders, dispute losses `returned` ones (P6 decides more). */
export async function providerScheduleStats(
	payload: Payload,
	shopId: string,
	req?: PayloadRequest,
): Promise<ProviderScheduleStats> {
	const count = async (extra: Where) =>
		(
			await payload.count({
				collection: "orders",
				where: {
					and: [
						{ shop: { equals: shopId } },
						{ paymentMethod: { equals: "cod" } },
						extra,
					],
				},
				overrideAccess: true,
				...(req ? { req } : {}),
			})
		).totalDocs;
	const completedCodOrders = await count({ status: { equals: "completed" } });
	const refused = await count({ paymentStatus: { equals: "cod_refused" } });
	const returned = await count({ status: { equals: "returned" } });
	const outcomes = completedCodOrders + refused + returned;
	return {
		completedCodOrders,
		codLossRate: outcomes === 0 ? 0 : (refused + returned) / outcomes,
	};
}

/** The open-exposure cap for a level; halved under the fallback model. */
export function exposureCap(
	settings: Pick<PaymentSettings, "exposureCaps" | "releaseModel">,
	level: 2 | 3,
): number {
	const cap =
		level === 3 ? settings.exposureCaps.level3 : settings.exposureCaps.level2;
	return settings.releaseModel === "provider_schedule"
		? Math.floor(cap * PROVIDER_SCHEDULE_EXPOSURE_FACTOR)
		: cap;
}

// ─── The daily batch (primary model) ────────────────────────────────────────

export type ShopSkipReason =
	| "shop_hold"
	| "shop_suspended"
	| "failed_repeatedly"
	| "no_connected_account"
	| "no_payout_account"
	| "nothing_payable"
	| "below_min_payout"
	| "ledger_short";

export interface ReleaseRunResult {
	/** Completed orders whose release the handler had not posted, posted now. */
	caughtUp: string[];
	/** Orders given their 70% early release this run. */
	early: string[];
	payouts: Array<{
		shop: string;
		payout: string;
		amount: number;
		status: "pending" | "cancelled";
	}>;
	skipped: Array<{ shop: string; reason: ShopSkipReason }>;
}

async function eventOf(
	payload: Payload,
	orderId: string,
	type: OrderEvent["type"],
): Promise<OrderEvent | null> {
	const { docs } = await payload.find({
		collection: "order-events",
		where: {
			and: [{ order: { equals: orderId } }, { type: { equals: type } }],
		},
		sort: "-createdAt",
		limit: 1,
		depth: 0,
		overrideAccess: true,
	});
	return docs[0] ?? null;
}

/**
 * A completed order the handler never released — a blocker since cleared, or
 * a process that died between the transition and its dispatch — is released
 * here, under the same `order.completed` key.
 */
async function catchUpReleases(
	payload: Payload,
	settings: PaymentSettings,
): Promise<string[]> {
	const { docs } = await payload.find({
		collection: "orders",
		where: {
			and: [
				{ paymentMethod: { equals: "mobile_money" } },
				{ status: { equals: "completed" } },
				{ "settlement.releaseEligibleAt": { equals: null } },
			],
		},
		pagination: false,
		depth: 0,
		overrideAccess: true,
	});
	const released: string[] = [];
	for (const order of docs) {
		const event = await eventOf(payload, order.id, "order.completed");
		if (!event) continue;
		try {
			const result = await releaseCompletedOrder(payload, order, event, {
				settings,
			});
			if (result.released) released.push(order.id);
		} catch (error) {
			payload.logger.error(
				{ err: error, orderId: order.id },
				"[payouts] catch-up release failed",
			);
		}
	}
	return released;
}

async function earlyReleases(
	payload: Payload,
	settings: PaymentSettings,
	now: Date,
): Promise<string[]> {
	if (!settings.earlyRelease.enabled) return [];
	const cutoff = new Date(
		now.getTime() - EARLY_RELEASE_AFTER_DELIVERED_HOURS * HOUR_MS,
	).toISOString();
	const { docs } = await payload.find({
		collection: "orders",
		where: {
			and: [
				{ paymentMethod: { equals: "mobile_money" } },
				{ status: { equals: "delivered" } },
				{ "settlement.releaseModel": { equals: "provider_hold" } },
				{ "timestamps.deliveredAt": { less_than_equal: cutoff } },
			],
		},
		pagination: false,
		depth: 0,
		overrideAccess: true,
	});
	const byShop = new Map<string, Order[]>();
	for (const order of docs) {
		const shop = idOf(order.shop);
		byShop.set(shop, [...(byShop.get(shop) ?? []), order]);
	}
	const released: string[] = [];
	for (const [shopId, orders] of byShop) {
		const shop = await shopOf(payload, shopId);
		if (!shop) continue;
		const stats = await earlyReleaseStats(payload, shopId, now);
		if (!earlyReleaseEligible(shop, stats, now)) continue;
		for (const order of orders) {
			const delivered = await eventOf(payload, order.id, "order.delivered");
			if (!delivered) continue;
			const posted = await withTransaction(payload, async (req) => {
				const charges = await orderTransactions(req, order.id, ["charge"]);
				if (charges.length === 0) return false;
				const balances = await orderBalances(req, order.id);
				const amount = earlyReleaseAmount(
					order.amounts?.destinationAmount ?? 0,
					balances.seller_pending ?? 0,
				);
				if (amount <= 0) return false;
				const { created } = await postLedger(req, {
					kind: "release",
					occurredAt: now.toISOString(),
					sourceType: "order-event",
					sourceId: delivered.id,
					currency: currencyOf(order),
					order: order.id,
					shop: shopId,
					entries: postingFor("release", {
						amount,
						releaseModel: "provider_hold",
					}),
					memo: `early release ${EARLY_RELEASE_SHARE_PERCENT}%`,
				});
				return created;
			});
			if (posted) released.push(order.id);
		}
	}
	return released;
}

/** The last three submitted payouts of the shop all failed. */
async function failedRepeatedly(
	req: PayloadRequest,
	shopId: string,
): Promise<boolean> {
	const { docs } = await req.payload.find({
		collection: "payouts",
		where: {
			and: [
				{ shop: { equals: shopId } },
				{ origin: { equals: "platform_release" } },
				{ status: { not_in: ["scheduled", "cancelled"] } },
			],
		},
		sort: "-createdAt",
		limit: PAYOUT_FAILURES_BEFORE_HOLD,
		depth: 0,
		overrideAccess: true,
		req,
	});
	return (
		docs.length === PAYOUT_FAILURES_BEFORE_HOLD &&
		docs.every((p) => p.status === "failed")
	);
}

async function holdForRepeatedFailures(
	req: PayloadRequest,
	shopId: string,
): Promise<void> {
	const existing = (await activeHolds(req.payload, { shop: shopId }, req)).some(
		(h) => h.scope === "shop" && h.reason === "payout_failed_repeatedly",
	);
	if (existing) return;
	const hold = await createHold(req, {
		scope: "shop",
		shop: shopId,
		reason: "payout_failed_repeatedly",
		createdByType: "system",
		note: `${PAYOUT_FAILURES_BEFORE_HOLD} payouts failed in a row`,
	});
	await afterCommit(req, "hold notice", async () => {
		const shop = await shopOf(req.payload, shopId);
		if (!shop) return;
		await notifyPayoutHoldPlaced(shop, {
			holdId: hold.id,
			scope: "shop",
			orderId: null,
			category: holdReasonCategory("payout_failed_repeatedly"),
			checkPayoutAccount: true,
		});
	});
}

/** Live payouts (not failed, cancelled or reversed) already carrying this order's money. */
async function paidOut(req: PayloadRequest, orderId: string): Promise<number> {
	const { docs } = await req.payload.find({
		collection: "payouts",
		where: {
			and: [
				{ "orders.order": { equals: orderId } },
				{ status: { not_in: ["failed", "cancelled", "reversed"] } },
			],
		},
		pagination: false,
		depth: 0,
		overrideAccess: true,
		req,
	});
	return docs.reduce(
		(sum, payout) =>
			sum +
			(payout.orders ?? [])
				.filter((line) => idOf(line.order) === orderId)
				.reduce((s, line) => s + line.amount, 0),
		0,
	);
}

/**
 * A refund landing after `release` books its seller part to
 * `seller_receivable` (the posting table as written). While that order's
 * money still sits unpaid in `seller_releasable`, the two are netted here —
 * the refund already left the connected account, so paying the full D′
 * would pay out money the provider no longer holds. Keyed on the refund's
 * own source, so each refund nets once.
 */
async function netReceivables(
	req: PayloadRequest,
	order: Order,
	shopId: string,
	unpaid: number,
): Promise<void> {
	let available = unpaid;
	if (available <= 0) return;
	const postings = await orderTransactions(req, order.id, [
		"refund_submitted",
		"refund_failed",
	]);
	const failed = new Set(
		postings
			.filter((t) => t.kind === "refund_failed")
			.map((t) => idOf(t.reverses)),
	);
	for (const submitted of postings) {
		if (submitted.kind !== "refund_submitted" || failed.has(submitted.id))
			continue;
		const receivable = (await transactionLines(req, submitted))
			.filter((l) => l.category === "seller_receivable")
			.reduce((sum, l) => sum + l.debit, 0);
		const amount = Math.min(receivable, available);
		if (amount <= 0) continue;
		const { created } = await postLedger(req, {
			kind: "clawback_recovered",
			occurredAt: new Date().toISOString(),
			sourceType: submitted.sourceType as LedgerSourceType,
			sourceId: submitted.sourceId,
			currency: currencyOf(order),
			order: order.id,
			shop: shopId,
			...(submitted.refund ? { refund: idOf(submitted.refund) } : {}),
			entries: postingFor("clawback_recovered", {
				amount,
				from: "seller_releasable",
			}),
			memo: "refund after release netted before payout",
		});
		if (created) available -= amount;
	}
}

/** Payouts whose `payout_submitted` has not been posted still sit in `seller_releasable`. */
async function unsubmittedInFlight(
	req: PayloadRequest,
	shopId: string,
): Promise<number> {
	const { docs } = await req.payload.find({
		collection: "payouts",
		where: {
			and: [
				{ shop: { equals: shopId } },
				{ origin: { equals: "platform_release" } },
				{ status: { in: ["scheduled", "pending", "sent", "processing"] } },
			],
		},
		pagination: false,
		depth: 0,
		overrideAccess: true,
		req,
	});
	let total = 0;
	for (const payout of docs) {
		if (!(await payoutPosting(req, payout.id, "payout_submitted")))
			total += payout.amount;
	}
	return total;
}

interface ShopBatch {
	shopId: string;
	currency: string;
	orders: string[];
}

type ShopOutcome =
	| { skipped: ShopSkipReason }
	| { payout: Payout; accountId: string };

async function prepareShopPayout(
	payload: Payload,
	settings: PaymentSettings,
	batch: ShopBatch,
	now: Date,
): Promise<ShopOutcome> {
	return withTransaction(payload, async (req): Promise<ShopOutcome> => {
		const shop = await shopOf(payload, batch.shopId, req);
		if (!shop || shop.status === "suspended")
			return { skipped: "shop_suspended" };
		// Re-read inside the transaction: a hold placed since the selection
		// query (Review Focus 3) must still keep its money out of this payout.
		const holds = await activeHolds(payload, { shop: batch.shopId }, req);
		if (holds.some((h) => h.scope === "shop")) return { skipped: "shop_hold" };
		const heldOrders = new Set(holds.map((h) => idOf(h.order)));
		if (await failedRepeatedly(req, batch.shopId)) {
			await holdForRepeatedFailures(req, batch.shopId);
			return { skipped: "failed_repeatedly" };
		}

		const { docs: accounts } = await payload.find({
			collection: "connected-accounts",
			where: { shop: { equals: batch.shopId } },
			sort: "createdAt",
			limit: 1,
			depth: 0,
			overrideAccess: true,
			req,
		});
		const account = accounts[0];
		if (!account?.providerAccountId) return { skipped: "no_connected_account" };
		const { docs: payoutAccounts } = await payload.find({
			collection: "payout-accounts",
			where: {
				and: [
					{ shop: { equals: batch.shopId } },
					{ status: { equals: "active" } },
				],
			},
			limit: 1,
			depth: 0,
			overrideAccess: true,
			req,
		});
		const payoutAccount = payoutAccounts[0];
		if (!payoutAccount) return { skipped: "no_payout_account" };

		const lines: Array<{ order: Order; amount: number }> = [];
		const settledNothing: Order[] = [];
		for (const orderId of batch.orders) {
			if (heldOrders.has(orderId)) continue;
			const order = await payload.findByID({
				collection: "orders",
				id: orderId,
				depth: 0,
				overrideAccess: true,
				req,
			});
			if (order.settlement?.releasedAt) continue;
			const paid = await paidOut(req, orderId);
			const before = await orderBalances(req, orderId);
			await netReceivables(
				req,
				order,
				batch.shopId,
				(before.seller_releasable ?? 0) - paid,
			);
			const balances = await orderBalances(req, orderId);
			const payable =
				(balances.seller_releasable ?? 0) -
				Math.max(balances.seller_receivable ?? 0, 0) -
				paid;
			if (payable > 0) lines.push({ order, amount: payable });
			else if (
				payable === 0 &&
				order.status === "completed" &&
				order.settlement?.releaseEligibleAt
			)
				settledNothing.push(order);
		}
		const nowIso = now.toISOString();
		for (const order of settledNothing) {
			await updateSettlement(req, order, { releasedAt: nowIso });
		}

		const amount = lines.reduce((sum, line) => sum + line.amount, 0);
		if (amount <= 0) return { skipped: "nothing_payable" };
		if (amount < settings.minPayout) return { skipped: "below_min_payout" };
		const releasable = await accountBalance(
			payload,
			"seller_releasable",
			batch.shopId,
			batch.currency,
			req,
		);
		const inFlight = await unsubmittedInFlight(req, batch.shopId);
		if (amount > releasable - inFlight) {
			payload.logger.error(
				{ shopId: batch.shopId, amount, releasable, inFlight },
				"[payouts] orders add up to more than the shop's releasable balance",
			);
			return { skipped: "ledger_short" };
		}

		const payout = await payload.create({
			collection: "payouts",
			data: {
				shop: batch.shopId,
				connectedAccount: account.id,
				payoutAccount: payoutAccount.id,
				amount,
				currency: batch.currency,
				orders: lines.map((line) => ({
					order: line.order.id,
					amount: line.amount,
				})),
				origin: "platform_release",
				status: "scheduled",
				statusHistory: [{ status: "scheduled", source: "system", at: nowIso }],
			},
			overrideAccess: true,
			context: PAYOUT_CONTEXT,
			req,
		});
		for (const { order } of lines) {
			const completed =
				order.status === "completed" &&
				Boolean(order.settlement?.releaseEligibleAt);
			await updateSettlement(req, order, {
				payout: payout.id,
				...(completed ? { releasedAt: nowIso } : {}),
			});
		}
		return { payout, accountId: account.providerAccountId };
	});
}

/** Unbinds a payout's orders so the next run picks their money up again. */
async function freeOrders(req: PayloadRequest, payout: Payout): Promise<void> {
	for (const line of payout.orders ?? []) {
		const order = await req.payload.findByID({
			collection: "orders",
			id: idOf(line.order),
			depth: 0,
			overrideAccess: true,
			req,
		});
		if (idOf(order.settlement?.payout) !== payout.id) continue;
		await updateSettlement(req, order, { payout: null, releasedAt: null });
	}
}

const historyOf = (payout: Payout) =>
	(payout.statusHistory ?? []).map(({ status, source, at }) => ({
		status,
		source,
		at,
	}));

async function submitPayout(
	payload: Payload,
	provider: MarketplaceProvider,
	payout: Payout,
	accountId: string,
	now: Date,
): Promise<"pending" | "cancelled"> {
	let transferId: string | null = null;
	let failure: unknown = null;
	try {
		({ transferId } = await provider.releasePayout(accountId, {
			amount: payout.amount,
			currency: payout.currency,
			reference: payoutReference(payout.id),
		}));
	} catch (error) {
		failure = error;
	}
	return withTransaction(payload, async (req) => {
		const current = await payload.findByID({
			collection: "payouts",
			id: payout.id,
			depth: 0,
			overrideAccess: true,
			req,
		});
		const at = now.toISOString();
		if (transferId) {
			// A transfer webhook may have overtaken this answer; it then owns
			// the status, and only the id is still ours to record.
			const move = current.status === "scheduled";
			await payload.update({
				collection: "payouts",
				id: payout.id,
				data: {
					...(current.providerTransferId
						? {}
						: { providerTransferId: transferId }),
					...(move
						? {
								status: "pending",
								statusHistory: [
									...historyOf(current),
									{ status: "pending", source: "system", at },
								],
							}
						: {}),
				},
				overrideAccess: true,
				context: PAYOUT_CONTEXT,
				req,
			});
			return "pending";
		}
		payload.logger.error(
			{ err: failure, payoutId: payout.id },
			"[payouts] releasePayout refused; payout cancelled, retried next run",
		);
		if (current.status !== "scheduled") return "pending";
		await payload.update({
			collection: "payouts",
			id: payout.id,
			data: {
				status: "cancelled",
				failureReason:
					failure instanceof Error ? failure.message : "releasePayout failed",
				statusHistory: [
					...historyOf(current),
					{ status: "cancelled", source: "system", at },
				],
			},
			overrideAccess: true,
			context: PAYOUT_CONTEXT,
			req,
		});
		await freeOrders(req, current);
		return "cancelled";
	});
}

/**
 * The primary model's daily run. Selection is a first pass only: every hold
 * and every amount is decided again inside the shop's own transaction.
 */
export async function releaseEligibleFunds(
	payload: Payload,
	now = new Date(),
	deps: PayoutDeps = {},
): Promise<ReleaseRunResult> {
	const settings = deps.settings ?? (await getPaymentSettings(payload));
	const result: ReleaseRunResult = {
		caughtUp: await catchUpReleases(payload, settings),
		early: await earlyReleases(payload, settings, now),
		payouts: [],
		skipped: [],
	};

	const { docs } = await payload.find({
		collection: "orders",
		where: {
			and: [
				{ paymentMethod: { equals: "mobile_money" } },
				{ "settlement.releaseModel": { equals: "provider_hold" } },
				{ "settlement.releasedAt": { equals: null } },
				{ status: { in: ["delivered", "completed"] } },
			],
		},
		pagination: false,
		depth: 0,
		overrideAccess: true,
	});
	const batches = new Map<string, ShopBatch>();
	for (const order of docs) {
		const shopId = idOf(order.shop);
		const currency = currencyOf(order);
		const key = `${shopId}:${currency}`;
		const batch = batches.get(key) ?? { shopId, currency, orders: [] };
		batch.orders.push(order.id);
		batches.set(key, batch);
	}

	let provider = deps.provider ?? null;
	for (const batch of batches.values()) {
		const holds = await activeHolds(payload, { shop: batch.shopId });
		if (holds.some((h) => h.scope === "shop")) {
			result.skipped.push({ shop: batch.shopId, reason: "shop_hold" });
			continue;
		}
		const held = new Set(holds.map((h) => idOf(h.order)));
		const orders = batch.orders.filter((id) => !held.has(id));
		if (orders.length === 0) {
			result.skipped.push({ shop: batch.shopId, reason: "nothing_payable" });
			continue;
		}

		const outcome = await prepareShopPayout(
			payload,
			settings,
			{ ...batch, orders },
			now,
		);
		if ("skipped" in outcome) {
			result.skipped.push({ shop: batch.shopId, reason: outcome.skipped });
			continue;
		}
		provider ??= getMarketplaceProvider(settings);
		const status = await submitPayout(
			payload,
			provider,
			outcome.payout,
			outcome.accountId,
			now,
		);
		result.payouts.push({
			shop: batch.shopId,
			payout: outcome.payout.id,
			amount: outcome.payout.amount,
			status,
		});
	}
	return result;
}

// ─── Transfer lifecycle (both models) ───────────────────────────────────────

export interface TransferEventOptions {
	source?: "webhook" | "reconcile";
	/** The `webhook-events` row or the reconciliation run behind this event. */
	sourceId?: string;
}

export type TransferOutcome =
	| {
			applied: false;
			reason: "reseller" | "unknown_payout" | "unknown_account";
	  }
	| {
			applied: true;
			payout: string;
			status: PayoutStatus;
			/** False when the transition table ignored the event (replay, late or out-of-order). */
			changed: boolean;
	  };

type PayoutKind =
	| "payout_submitted"
	| "payout_complete"
	| "payout_failed"
	| "payout_reversed";

async function payoutPosting(
	req: PayloadRequest,
	payoutId: string,
	kind: PayoutKind,
): Promise<boolean> {
	const { totalDocs } = await req.payload.count({
		collection: "ledger-transactions",
		where: {
			and: [{ payout: { equals: payoutId } }, { kind: { equals: kind } }],
		},
		overrideAccess: true,
		req,
	});
	return totalDocs > 0;
}

/**
 * At most one posting of each kind per payout, whichever source (webhook or
 * reconciliation) delivers the state first: the payout id is the key, and
 * the explicit read covers the other source's key.
 */
async function postForPayout(
	req: PayloadRequest,
	payout: Payout,
	kind: PayoutKind,
	event: TransferEvent,
	options: TransferEventOptions,
): Promise<void> {
	if (await payoutPosting(req, payout.id, kind)) return;
	const sourceType: LedgerSourceType =
		options.source === "reconcile" ? "reconciliation-run" : "webhook-event";
	await postLedger(req, {
		kind,
		occurredAt: new Date().toISOString(),
		sourceType,
		sourceId: payout.id,
		currency: payout.currency,
		shop: idOf(payout.shop),
		payout: payout.id,
		entries: postingFor(kind, { amount: payout.amount }),
		memo: `${event.type} ${options.sourceId ?? event.providerEventId}`,
	});
}

async function findPayoutFor(
	req: PayloadRequest,
	event: TransferEvent,
): Promise<Payout | null> {
	const { docs } = await req.payload.find({
		collection: "payouts",
		where: { providerTransferId: { equals: event.transferId } },
		limit: 1,
		depth: 0,
		overrideAccess: true,
		req,
	});
	if (docs[0]) return docs[0];
	const match = PAYOUT_REFERENCE.exec(event.reference ?? "");
	if (!match) return null;
	return req.payload
		.findByID({
			collection: "payouts",
			id: match[1],
			depth: 0,
			overrideAccess: true,
			req,
		})
		.catch(() => null);
}

const historySource = (options: TransferEventOptions) =>
	options.source === "reconcile"
		? ("reconcile" as const)
		: ("webhook" as const);

/** A transfer the provider scheduled itself (`provider_schedule`): the row is born from the event. */
async function createScheduledPayout(
	req: PayloadRequest,
	event: TransferEvent,
	options: TransferEventOptions,
): Promise<Payout | null> {
	const { docs } = await req.payload.find({
		collection: "connected-accounts",
		where: { providerAccountId: { equals: event.accountId } },
		limit: 1,
		depth: 0,
		overrideAccess: true,
		req,
	});
	const account = docs[0];
	if (!account || event.amount === null || !event.currency) return null;
	return req.payload.create({
		collection: "payouts",
		data: {
			shop: idOf(account.shop),
			connectedAccount: account.id,
			amount: event.amount,
			...(event.fee !== null ? { fee: event.fee } : {}),
			currency: event.currency,
			orders: [],
			origin: "provider_schedule",
			status: event.status,
			statusHistory: [
				{
					status: event.status,
					source: historySource(options),
					at: new Date().toISOString(),
				},
			],
			providerTransferId: event.transferId,
			...(event.failureReason ? { failureReason: event.failureReason } : {}),
		},
		overrideAccess: true,
		context: PAYOUT_CONTEXT,
		req,
	});
}

const TERMINAL_POSTING: Partial<Record<PayoutStatus, PayoutKind>> = {
	complete: "payout_complete",
	failed: "payout_failed",
	reversed: "payout_reversed",
};

/**
 * Drives a `payouts` row from a `transfer/*` event, in the caller's
 * transaction. Monotonic: a status the table does not allow from the current
 * one (a replay, or `created` arriving after `complete`) changes nothing and
 * posts nothing new. A platform payout's `payout_submitted` is posted with the
 * first event that proves the provider has it, whichever that is.
 */
export async function applyTransferEvent(
	req: PayloadRequest,
	event: TransferEvent,
	options: TransferEventOptions = {},
): Promise<TransferOutcome> {
	const { payload } = req;
	if ((event.reference ?? "").startsWith("RP-"))
		return { applied: false, reason: "reseller" };

	let payout = await findPayoutFor(req, event);
	let changed = false;
	if (!payout) {
		if (PAYOUT_REFERENCE.test(event.reference ?? "")) {
			payload.logger.error(
				{ transferId: event.transferId, reference: event.reference },
				"[payouts] transfer event for an unknown platform payout",
			);
			return { applied: false, reason: "unknown_payout" };
		}
		payout = await createScheduledPayout(req, event, options);
		if (!payout) return { applied: false, reason: "unknown_account" };
		changed = true;
	} else {
		let from = payout.status;
		const history = historyOf(payout);
		const at = new Date().toISOString();
		// A transfer event proves the provider accepted it, even if our own
		// `releasePayout` answer has not been recorded yet.
		if (from === "scheduled" && event.status !== "pending") {
			history.push({ status: "pending", source: historySource(options), at });
			from = "pending";
		}
		const target: PayoutStatus = event.status;
		if (canMovePayout(from, target) || from !== payout.status) {
			const moves = canMovePayout(from, target);
			if (moves)
				history.push({ status: target, source: historySource(options), at });
			payout = await payload.update({
				collection: "payouts",
				id: payout.id,
				data: {
					status: moves ? target : from,
					statusHistory: history,
					...(payout.providerTransferId
						? {}
						: { providerTransferId: event.transferId }),
					...(event.fee !== null ? { fee: event.fee } : {}),
					...(moves && event.failureReason
						? { failureReason: event.failureReason }
						: {}),
				},
				overrideAccess: true,
				context: PAYOUT_CONTEXT,
				req,
			});
			changed = moves;
		}
	}

	const platform = payout.origin === "platform_release";
	if (
		platform &&
		payout.status !== "scheduled" &&
		payout.status !== "cancelled"
	) {
		await postForPayout(req, payout, "payout_submitted", event, options);
	}
	const terminal = changed ? TERMINAL_POSTING[payout.status] : undefined;
	// Under `provider_schedule` nothing was ever submitted from
	// `seller_releasable`, so a failed transfer has nothing to give back.
	if (terminal && (platform || terminal !== "payout_failed")) {
		await postForPayout(req, payout, terminal, event, options);
	}

	if (
		changed &&
		platform &&
		(payout.status === "failed" || payout.status === "reversed")
	) {
		await freeOrders(req, payout);
	}
	const shopId = idOf(payout.shop);
	if (changed && platform && payout.status === "failed") {
		if (await failedRepeatedly(req, shopId))
			await holdForRepeatedFailures(req, shopId);
	}
	if (changed && (payout.status === "complete" || payout.status === "failed")) {
		const settled = payout;
		await afterCommit(req, "payout notice", async () => {
			const shop = await shopOf(payload, shopId);
			if (!shop) return;
			const notice = {
				payoutId: settled.id,
				amount: settled.amount,
				currency: settled.currency,
			};
			if (settled.status === "complete") await notifyPayoutSent(shop, notice);
			else await notifyPayoutFailed(shop, notice);
		});
	}
	return { applied: true, payout: payout.id, status: payout.status, changed };
}

export type MirrorOutcome =
	| { mirrored: true; payout: Payout; outcome: TransferOutcome }
	| {
			mirrored: false;
			reason: "not_cancelled" | "amount_differs" | "orders_repaid";
	  };

/**
 * `submitPayout` cancels a payout whose `releasePayout` call failed — a
 * timeout included, after which the provider may still have created the
 * transfer. When reconciliation finds that transfer, the cancelled row stays
 * as it is (it records what we believed) and a new row mirrors the transfer,
 * with the same orders, then follows it like any transfer event. Refused when
 * any of those orders has since been bound to another live payout: the seller
 * was then paid twice, and staff decide.
 */
export async function mirrorCancelledTransfer(
	req: PayloadRequest,
	cancelled: Payout,
	event: TransferEvent,
	options: TransferEventOptions = {},
): Promise<MirrorOutcome> {
	const { payload } = req;
	if (cancelled.status !== "cancelled" || cancelled.providerTransferId) {
		return { mirrored: false, reason: "not_cancelled" };
	}
	if (event.amount !== cancelled.amount) {
		return { mirrored: false, reason: "amount_differs" };
	}
	const orders: Order[] = [];
	for (const line of cancelled.orders ?? []) {
		const order = await payload.findByID({
			collection: "orders",
			id: idOf(line.order),
			depth: 0,
			overrideAccess: true,
			req,
		});
		const bound = relationId(order.settlement?.payout);
		if (bound && bound !== cancelled.id) {
			return { mirrored: false, reason: "orders_repaid" };
		}
		orders.push(order);
	}
	const at = new Date().toISOString();
	const mirror = await payload.create({
		collection: "payouts",
		data: {
			shop: idOf(cancelled.shop),
			connectedAccount: idOf(cancelled.connectedAccount),
			...(cancelled.payoutAccount
				? { payoutAccount: idOf(cancelled.payoutAccount) }
				: {}),
			amount: cancelled.amount,
			currency: cancelled.currency,
			orders: (cancelled.orders ?? []).map((line) => ({
				order: idOf(line.order),
				amount: line.amount,
			})),
			origin: "platform_release",
			status: "pending",
			statusHistory: [
				{ status: "pending", source: historySource(options), at },
			],
			providerTransferId: event.transferId,
		},
		overrideAccess: true,
		context: PAYOUT_CONTEXT,
		req,
	});
	for (const order of orders) {
		const completed =
			order.status === "completed" &&
			Boolean(order.settlement?.releaseEligibleAt);
		await updateSettlement(req, order, {
			payout: mirror.id,
			...(completed ? { releasedAt: at } : {}),
		});
	}
	const outcome = await applyTransferEvent(req, event, options);
	return { mirrored: true, payout: mirror, outcome };
}
