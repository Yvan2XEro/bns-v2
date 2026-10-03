import type { Payload, PayloadRequest } from "payload";
import type { LedgerCategory } from "../collections/LedgerAccounts";
import { ERROR_CODES } from "../lib/errors";
import { monthBoundsDouala } from "../lib/orderMath";
import { getPaymentSettings } from "../lib/paymentSettings";
import { relationId } from "../lib/relationId";
import { ServiceError } from "../lib/serviceError";
import { withTransaction } from "../lib/transactions";
import type { Order, Payout, Shop } from "../payload-types";
import {
	holdsView,
	marketOf,
	type PaymentSetupView,
	requirePaymentsViewer,
} from "./connectedAccounts";
import { accountBalance, balancesByOrder } from "./ledger";
import { activeHolds } from "./payoutHolds";
import { paidOut } from "./payouts";
import { findShop } from "./shopGuards";
import type { ServiceUser } from "./shops";

/** `GET /api/shops/{id}/payments`: the seller payments screen. */
export interface SellerPaymentsView {
	amounts: {
		awaitingDelivery: number;
		inWithdrawalPeriod: number;
		readyForPayout: number | null;
		payoutInTransit: number;
		paidThisMonth: number;
		currency: string;
	};
	payouts: SellerPayoutRow[];
	orders: Array<{
		orderId: string;
		orderNumber: string;
		goods: number;
		delivery: number;
		commissionHt: number;
		vat: number;
		netToYou: number;
		status: string;
		releaseDate: string | null;
	}>;
	holds: PaymentSetupView["holds"];
}

export interface SellerPayoutRow {
	id: string;
	date: string;
	amount: number;
	fee: number;
	destinationMasked: string;
	status: string;
}

/** `GET /api/shops/{id}/payments/payouts/{payoutId}`. */
export interface SellerPayoutDetail extends SellerPayoutRow {
	currency: string;
	orders: Array<{ orderId: string; orderNumber: string; amount: number }>;
	statusHistory: Array<{ status: string; at: string }>;
}

/** The screen lists the latest rows; the amounts above them cover everything. */
export const SELLER_PAYMENTS_LIST_LIMIT = 50;

/** Every protected order whose charge settled, whatever happened after. */
const CHARGED_PAYMENT_STATUSES: readonly Order["paymentStatus"][] = [
	"paid",
	"partially_refunded",
	"refunded",
];

type Balances = Partial<Record<LedgerCategory, number>>;

const idOf = (value: unknown): string => relationId(value) ?? "";

/**
 * What the seller is owed on one order: what the provider still holds or is
 * paying out for it, less what a refund after release took back. Payout
 * postings carry no order, so a paid-out order keeps its figure.
 */
function sellerPosition(balances: Balances): number {
	return (
		(balances.seller_pending ?? 0) +
		(balances.seller_releasable ?? 0) +
		(balances.seller_payout_in_transit ?? 0) -
		(balances.seller_receivable ?? 0)
	);
}

/** When the provider's `complete` landed, from the payout's own history. */
function completedAt(payout: Payout): string | null {
	const entries = (payout.statusHistory ?? []).filter(
		(entry) => entry.status === "complete",
	);
	return entries.at(-1)?.at ?? null;
}

function currencyOf(
	settings: Awaited<ReturnType<typeof getPaymentSettings>>,
	shop: Shop,
): string {
	const market = marketOf(settings, shop);
	if (!market)
		throw new ServiceError(ERROR_CODES.paymentMarketUnavailable, 400);
	return market.currency;
}

async function maskedDestinations(
	req: PayloadRequest,
	payouts: readonly Payout[],
): Promise<Map<string, string>> {
	const ids = [
		...new Set(payouts.map((p) => idOf(p.payoutAccount)).filter(Boolean)),
	];
	if (ids.length === 0) return new Map();
	const { docs } = await req.payload.find({
		collection: "payout-accounts",
		where: { id: { in: ids } },
		pagination: false,
		depth: 0,
		overrideAccess: true,
		req,
	});
	return new Map(
		docs.map((row) => [String(row.id), row.accountNumberMasked ?? ""]),
	);
}

function payoutRow(
	payout: Payout,
	destinations: Map<string, string>,
): SellerPayoutRow {
	return {
		id: String(payout.id),
		date: payout.createdAt,
		amount: payout.amount,
		fee: payout.fee ?? 0,
		destinationMasked: destinations.get(idOf(payout.payoutAccount)) ?? "",
		status: payout.status,
	};
}

async function shopOrders(
	req: PayloadRequest,
	shopId: string,
	extra: { status?: Order["status"]; limit?: number } = {},
): Promise<Order[]> {
	const { docs } = await req.payload.find({
		collection: "orders",
		where: {
			and: [
				{ shop: { equals: shopId } },
				{ paymentMethod: { equals: "mobile_money" } },
				{ paymentStatus: { in: [...CHARGED_PAYMENT_STATUSES] } },
				...(extra.status ? [{ status: { equals: extra.status } }] : []),
			],
		},
		sort: "-createdAt",
		...(extra.limit ? { limit: extra.limit } : { limit: 0, pagination: false }),
		depth: 0,
		overrideAccess: true,
		req,
	});
	return docs;
}

/**
 * Read in one transaction so the amounts are one snapshot of the ledger.
 * Every amount comes from the ledger. `seller_pending` is split in two: the
 * share of delivered orders still inside their withdrawal window, and the
 * rest, awaiting delivery. `seller_releasable` also holds the money of
 * orders under a hold (Task 16 posts `release` regardless), which must not
 * read as ready: a shop hold or a suspension leaves nothing ready, and an
 * order hold takes that order's unpaid releasable money out.
 */
export async function sellerPaymentsView(
	payload: Payload,
	user: ServiceUser,
	shopId: string,
	now: Date = new Date(),
): Promise<SellerPaymentsView> {
	const shop = await findShop(payload, shopId);
	await requirePaymentsViewer(payload, user, shop);
	const settings = await getPaymentSettings(payload);
	const currency = currencyOf(settings, shop);
	const id = String(shop.id);

	return withTransaction(payload, async (req) => {
		const balance = (category: LedgerCategory) =>
			accountBalance(payload, category, id, currency, req);
		// Sequential on purpose: one Mongo session runs one operation at a time.
		const pending = await balance("seller_pending");
		const releasable = await balance("seller_releasable");
		const inTransit = await balance("seller_payout_in_transit");
		const holds = await activeHolds(payload, { shop: id }, req);
		const delivered = await shopOrders(req, id, { status: "delivered" });
		const recent = await shopOrders(req, id, {
			limit: SELLER_PAYMENTS_LIST_LIMIT,
		});

		const deliveredBalances = await balancesByOrder(
			req,
			delivered.map((o) => String(o.id)),
		);
		const inWithdrawalPeriod = [...deliveredBalances.values()].reduce(
			(sum, b) => sum + Math.max(b.seller_pending ?? 0, 0),
			0,
		);

		let readyForPayout: number | null = null;
		if (settings.releaseModel === "provider_hold") {
			const shopHeld =
				shop.status === "suspended" || holds.some((h) => h.scope === "shop");
			if (shopHeld) {
				readyForPayout = 0;
			} else {
				const heldOrders = [
					...new Set(
						holds.filter((h) => h.scope === "order").map((h) => idOf(h.order)),
					),
				];
				const heldBalances = await balancesByOrder(req, heldOrders);
				let held = 0;
				for (const orderId of heldOrders) {
					const unpaid =
						(heldBalances.get(orderId)?.seller_releasable ?? 0) -
						(await paidOut(req, orderId));
					held += Math.max(unpaid, 0);
				}
				readyForPayout = Math.max(releasable - held, 0);
			}
		}

		const { docs: payouts } = await payload.find({
			collection: "payouts",
			where: { shop: { equals: id } },
			sort: "-createdAt",
			pagination: false,
			depth: 0,
			overrideAccess: true,
			req,
		});
		const month = monthBoundsDouala(now);
		const paidThisMonth = payouts
			.filter((p) => p.status === "complete")
			.filter((p) => {
				const at = completedAt(p);
				return at !== null && at >= month.start && at < month.end;
			})
			.reduce((sum, p) => sum + p.amount, 0);

		const listed = payouts.slice(0, SELLER_PAYMENTS_LIST_LIMIT);
		const destinations = await maskedDestinations(req, listed);
		const recentBalances = await balancesByOrder(
			req,
			recent.map((o) => String(o.id)),
		);

		return {
			amounts: {
				awaitingDelivery: Math.max(pending - inWithdrawalPeriod, 0),
				inWithdrawalPeriod,
				readyForPayout,
				payoutInTransit: inTransit,
				paidThisMonth,
				currency,
			},
			payouts: listed.map((p) => payoutRow(p, destinations)),
			orders: recent.map((order) => ({
				orderId: String(order.id),
				orderNumber: order.orderNumber,
				goods: (order.amounts?.subtotal ?? 0) - (order.amounts?.discount ?? 0),
				delivery: order.amounts?.deliveryFee ?? 0,
				commissionHt: order.amounts?.commission ?? 0,
				vat: order.amounts?.commissionVat ?? 0,
				netToYou: sellerPosition(recentBalances.get(String(order.id)) ?? {}),
				status: order.status,
				releaseDate:
					order.settlement?.releaseEligibleAt ??
					(order.status === "delivered"
						? (order.deadlines?.withdrawalUntil ?? null)
						: null),
			})),
			holds: holdsView(holds),
		};
	});
}

/** A payout of another shop answers exactly like one that does not exist. */
export async function sellerPayoutDetail(
	payload: Payload,
	user: ServiceUser,
	shopId: string,
	payoutId: string,
): Promise<SellerPayoutDetail> {
	const shop = await findShop(payload, shopId);
	await requirePaymentsViewer(payload, user, shop);

	return withTransaction(payload, async (req) => {
		const { docs } = await payload.find({
			collection: "payouts",
			where: {
				and: [
					{ id: { equals: payoutId } },
					{ shop: { equals: String(shop.id) } },
				],
			},
			limit: 1,
			depth: 0,
			overrideAccess: true,
			req,
		});
		const payout = docs[0];
		if (!payout) throw new ServiceError(ERROR_CODES.notFound, 404);

		const lines = payout.orders ?? [];
		const orderIds = lines.map((line) => idOf(line.order));
		const { docs: orders } = orderIds.length
			? await payload.find({
					collection: "orders",
					where: { id: { in: orderIds } },
					pagination: false,
					depth: 0,
					overrideAccess: true,
					req,
				})
			: { docs: [] };
		const numbers = new Map(orders.map((o) => [String(o.id), o.orderNumber]));

		return {
			...payoutRow(payout, await maskedDestinations(req, [payout])),
			currency: payout.currency,
			orders: lines.map((line) => ({
				orderId: idOf(line.order),
				orderNumber: numbers.get(idOf(line.order)) ?? "",
				amount: line.amount,
			})),
			statusHistory: (payout.statusHistory ?? []).map((entry) => ({
				status: entry.status,
				at: entry.at,
			})),
		};
	});
}
