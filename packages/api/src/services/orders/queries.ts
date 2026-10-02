import type { Payload, PayloadRequest, Where } from "payload";
import {
	type OrderViewer,
	requireOrderAudience,
} from "../../access/orderAccess";
import { ERROR_CODES } from "../../lib/errors";
import type { ContractSnapshot } from "../../lib/orderContract";
import {
	type OrderStatusName,
	SHOP_ORDER_TABS,
	type ShopOrderTab,
	TAB_STATUSES,
} from "../../lib/orderFormat";
import { renderReceiptHtml } from "../../lib/orderReceipt";
import { ServiceError } from "../../lib/serviceError";
import type { Order, OrderEvent, OrderItem } from "../../payload-types";
import { requireShopPermission } from "../shopGuards";
import type { ServiceUser } from "../shops";
import {
	type BuyerOrderView,
	type OrderListEntryView,
	type ShopOrderView,
	type StaffOrderView,
	serializeOrderForBuyer,
	serializeOrderForShop,
	serializeOrderForStaff,
	serializeOrderListEntry,
} from "./serialize";

/** One page of either list. Fixed, not client-controlled: a caller cannot
 * ask for more than this, so a list that is read constantly never costs
 * more than this many rows per request however large it grows. */
export const ORDER_LIST_PAGE_SIZE = 20;

/**
 * An order's own items and events are bounded by that one order, not by how
 * many orders exist — unlike the lists below, a buyer or a shop cannot
 * inflate this by placing more orders elsewhere. The limits here are a
 * ceiling against a corrupt or pathological document, not a pagination
 * contract; there is no `cursor` for either.
 */
const ORDER_ITEMS_LIMIT = 200;
const ORDER_EVENTS_LIMIT = 500;

export type OrderView = BuyerOrderView | ShopOrderView | StaffOrderView;

export interface OrderPage {
	docs: OrderListEntryView[];
	nextCursor: string | null;
}

export interface ShopOrderPage extends OrderPage {
	counts: Record<ShopOrderTab, number>;
}

export interface BuyerOrderListQuery {
	status?: OrderStatusName;
	cursor?: string;
}

export interface ShopOrderListQuery {
	tab: ShopOrderTab;
	q?: string;
	cursor?: string;
}

async function loadOrderItems(
	payload: Payload,
	orderId: string,
	req?: PayloadRequest,
): Promise<OrderItem[]> {
	const result = await payload.find({
		collection: "order-items",
		where: { order: { equals: orderId } },
		depth: 0,
		limit: ORDER_ITEMS_LIMIT,
		overrideAccess: true,
		req,
	});
	return result.docs as OrderItem[];
}

async function loadOrderEvents(
	payload: Payload,
	orderId: string,
	req?: PayloadRequest,
): Promise<OrderEvent[]> {
	const result = await payload.find({
		collection: "order-events",
		where: { order: { equals: orderId } },
		// Chronological: the timeline is read as a history, oldest first.
		sort: "createdAt",
		depth: 0,
		limit: ORDER_EVENTS_LIMIT,
		overrideAccess: true,
		req,
	});
	return result.docs as OrderEvent[];
}

/**
 * The buyer's own purchase list — keyset-paginated on `createdAt`, the same
 * "older than the last row I saw" scheme as `listShopActivity`, so a page
 * boundary never repeats or skips an order the way an offset would once a
 * new order lands between two requests.
 */
export async function listBuyerOrders(
	payload: Payload,
	user: OrderViewer,
	query: BuyerOrderListQuery = {},
): Promise<OrderPage> {
	const and: Where[] = [{ buyer: { equals: user.id } }];
	if (query.status) and.push({ status: { equals: query.status } });
	if (query.cursor) and.push({ createdAt: { less_than: query.cursor } });

	const result = await payload.find({
		collection: "orders",
		where: { and },
		sort: "-createdAt",
		depth: 0,
		limit: ORDER_LIST_PAGE_SIZE,
		overrideAccess: true,
	});

	const rows = result.docs as Order[];
	return {
		docs: rows.map(serializeOrderListEntry),
		nextCursor:
			rows.length === ORDER_LIST_PAGE_SIZE
				? rows[rows.length - 1].createdAt
				: null,
	};
}

/**
 * The single order view, projected for whichever audience the caller turns
 * out to be. `requireOrderAudience` is the only check: a stranger gets
 * `order.notFound` before this function ever loads an item or an event.
 */
export async function getOrderView(
	payload: Payload,
	user: OrderViewer,
	orderId: string,
	req?: PayloadRequest,
): Promise<OrderView> {
	const { order, audience } = await requireOrderAudience(
		payload,
		user,
		orderId,
		req,
	);
	const [items, events] = await Promise.all([
		loadOrderItems(payload, orderId, req),
		loadOrderEvents(payload, orderId, req),
	]);

	switch (audience.kind) {
		case "buyer":
			return serializeOrderForBuyer(order, items, events);
		case "shop":
			return serializeOrderForShop(order, items, events, audience.role);
		case "staff":
			return serializeOrderForStaff(order, items, events);
	}
}

/**
 * Structural guard, not a cast: `contract.snapshot` is stored as opaque
 * JSON, and this is what narrows it back to `ContractSnapshot` before it is
 * handed to `renderReceiptHtml`. Checks the handful of fields the renderer
 * actually dereferences — a wider check would still only be as strong as
 * this one once a required nested field is missing.
 */
function isContractSnapshot(value: unknown): value is ContractSnapshot {
	if (!value || typeof value !== "object") return false;
	const v = value as Record<string, unknown>;
	if (typeof v.termsVersion !== "string") return false;
	if (v.locale !== "fr" && v.locale !== "en") return false;
	if (!Array.isArray(v.items)) return false;
	if (!v.amounts || typeof v.amounts !== "object") return false;
	if (!v.withdrawal || typeof v.withdrawal !== "object") return false;
	if (!v.seller || typeof v.seller !== "object") return false;
	if (!v.platform || typeof v.platform !== "object") return false;
	return true;
}

/**
 * The printable receipt's HTML, for whichever audience may see this order —
 * buyer, the fulfilling shop or staff, the same `requireOrderAudience` gate
 * as the view, so a stranger gets `order.notFound` here too rather than
 * learning the order exists from a different status code.
 */
export async function getOrderReceiptHtml(
	payload: Payload,
	user: OrderViewer,
	orderId: string,
	lang: "fr" | "en",
	req?: PayloadRequest,
): Promise<string> {
	const { order } = await requireOrderAudience(payload, user, orderId, req);
	const snapshot = order.contract?.snapshot;
	const snapshotHash = order.contract?.snapshotHash;
	if (!isContractSnapshot(snapshot) || typeof snapshotHash !== "string") {
		throw new ServiceError(
			ERROR_CODES.server,
			500,
			"order has no printable contract snapshot",
		);
	}
	return renderReceiptHtml(
		{
			orderNumber: order.orderNumber,
			orderDate: order.createdAt,
			printedAt: new Date().toISOString(),
			snapshot,
			snapshotHash,
		},
		lang,
	);
}

/**
 * `q` narrows the counts exactly as it narrows the rows. Without it the tab
 * bar said 12 while the open tab showed 3 — the brief asks for counts that
 * "agree with the rows", and a search is the one case where they would not.
 */
async function tabCounts(
	payload: Payload,
	shopId: string,
	q?: string,
	req?: PayloadRequest,
): Promise<Record<ShopOrderTab, number>> {
	const search: Where[] = q
		? [
				{
					or: [
						{ orderNumber: { like: q } },
						{ "delivery.recipientName": { like: q } },
					],
				},
			]
		: [];
	const counts = {} as Record<ShopOrderTab, number>;
	for (const tab of SHOP_ORDER_TABS) {
		const result = await payload.count({
			collection: "orders",
			where: {
				and: [
					{ shop: { equals: shopId } },
					{ status: { in: TAB_STATUSES[tab] } },
					...search,
				],
			},
			overrideAccess: true,
			req,
		});
		counts[tab] = result.totalDocs;
	}
	return counts;
}

/**
 * A shop's triaged order list: one tab's rows, keyset-paginated the same
 * way the buyer list is, plus every tab's count so the tab bar and the rows
 * behind the open tab can never disagree. `tab` is required and must be one
 * of `SHOP_ORDER_TABS` — the route's zod schema refuses anything else
 * before this function runs, so there is no "unknown tab" branch here to
 * default to every status.
 *
 * `orders.view` is the only gate: a staff member who holds it lists orders
 * same as an owner, and the row shape (`serializeOrderListEntry`) never
 * carries a commission field for anyone, list or detail.
 */
export async function listShopOrders(
	payload: Payload,
	user: ServiceUser,
	shopId: string,
	query: ShopOrderListQuery,
	req?: PayloadRequest,
): Promise<ShopOrderPage> {
	await requireShopPermission(payload, user, shopId, "orders.view", { req });

	const and: Where[] = [
		{ shop: { equals: shopId } },
		{ status: { in: TAB_STATUSES[query.tab] } },
	];
	if (query.q) {
		and.push({
			or: [
				{ orderNumber: { like: query.q } },
				{ "delivery.recipientName": { like: query.q } },
			],
		});
	}
	if (query.cursor) and.push({ createdAt: { less_than: query.cursor } });

	const result = await payload.find({
		collection: "orders",
		where: { and },
		sort: "-createdAt",
		depth: 0,
		limit: ORDER_LIST_PAGE_SIZE,
		overrideAccess: true,
		req,
	});

	const rows = result.docs as Order[];
	const counts = await tabCounts(payload, shopId, query.q, req);

	return {
		docs: rows.map(serializeOrderListEntry),
		nextCursor:
			rows.length === ORDER_LIST_PAGE_SIZE
				? rows[rows.length - 1].createdAt
				: null,
		counts,
	};
}
