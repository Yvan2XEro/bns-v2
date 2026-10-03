import type { Payload, PayloadRequest, Where } from "payload";
import {
	type OrderAudience,
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
import { toMediaRef } from "../../lib/publicShop";
import { relationId } from "../../lib/relationId";
import { ServiceError } from "../../lib/serviceError";
import type { Order, OrderEvent, OrderItem } from "../../payload-types";
import { requireShopPermission } from "../shopGuards";
import type { ServiceUser } from "../shops";
import {
	type BuyerOrderView,
	type OrderListEntryView,
	type OrderListRowSources,
	type OrderShopView,
	type OrderViewSources,
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

/**
 * A list row needs its order's unit count and its first line, so the batch
 * read behind a page is bounded per order rather than per page — a single
 * pathological order cannot starve the other nineteen rows of their items.
 */
const ORDER_LIST_ITEMS_PER_ORDER = 20;

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

const UNKNOWN_SHOP: OrderShopView = {
	id: "",
	name: "",
	handle: "",
	logoUrl: null,
	city: null,
	phone: null,
};

/**
 * `depth: 1` so the logo arrives as a `Media` document rather than an id —
 * `logoUrl` is the one field of the shop block a client cannot resolve on its
 * own. A shop that can no longer be read at all (hard-deleted under an order
 * that outlives it) resolves to `UNKNOWN_SHOP` rather than throwing: the order
 * is still the buyer's record of a purchase they made.
 */
async function loadOrderShop(
	payload: Payload,
	order: Order,
	req?: PayloadRequest,
): Promise<OrderShopView> {
	const shopId = relationId(order.shop);
	if (!shopId) return UNKNOWN_SHOP;
	const shop = await payload
		.findByID({
			collection: "shops",
			id: shopId,
			depth: 1,
			overrideAccess: true,
			req,
		})
		.catch(() => null);
	if (!shop) return { ...UNKNOWN_SHOP, id: shopId };
	return {
		id: shop.id,
		name: shop.name,
		handle: shop.handle,
		logoUrl: toMediaRef(shop.logo)?.url ?? null,
		city: shop.location?.city ?? null,
		phone: shop.contact?.phone ?? null,
	};
}

/** Display names for the users behind a set of relationships, in one query. */
async function loadUserNames(
	payload: Payload,
	ids: readonly string[],
	req?: PayloadRequest,
): Promise<Map<string, string>> {
	const names = new Map<string, string>();
	const unique = [...new Set(ids)];
	if (unique.length === 0) return names;
	const result = await payload.find({
		collection: "users",
		where: { id: { in: unique } },
		depth: 0,
		limit: unique.length,
		overrideAccess: true,
		req,
	});
	for (const user of result.docs) {
		if (user.name) names.set(String(user.id), user.name);
	}
	return names;
}

async function loadReturnCaseNumber(
	payload: Payload,
	order: Order,
	req?: PayloadRequest,
): Promise<string | null> {
	const caseId = relationId(order.returnCase);
	if (!caseId) return null;
	const returnCase = await payload
		.findByID({
			collection: "return-cases",
			id: caseId,
			depth: 0,
			overrideAccess: true,
			req,
		})
		.catch(() => null);
	return returnCase?.number ?? null;
}

/**
 * Narrower than `assertOrderReviewAllowed`'s own duplicate check, which keys
 * off `reviewer + reviewedUser + shop`: this one drops `reviewedUser`, so a
 * shop whose owner changed since the buyer reviewed it reads as already
 * reviewed. The conservative direction on purpose — a hidden button is a
 * smaller failure than one that answers `review.duplicate`.
 */
async function hasReviewedShop(
	payload: Payload,
	buyerId: string | null,
	shopId: string,
	req?: PayloadRequest,
): Promise<boolean> {
	if (!buyerId || !shopId) return false;
	const result = await payload.find({
		collection: "reviews",
		where: {
			and: [{ reviewer: { equals: buyerId } }, { shop: { equals: shopId } }],
		},
		depth: 0,
		limit: 1,
		overrideAccess: true,
		req,
	});
	return result.docs.length > 0;
}

/**
 * Everything the single-order projection needs beyond the `orders` document.
 * One function for all three audiences, so a field can never be present for
 * one of them only because a loader was wired up on one code path.
 */
export async function loadOrderViewSources(
	payload: Payload,
	order: Order,
	audience: OrderAudience,
	req?: PayloadRequest,
): Promise<OrderViewSources> {
	const buyerId = relationId(order.buyer);
	const shopId = relationId(order.shop) ?? "";
	const [items, events, shop, returnCaseNumber, buyerHasReviewedShop] =
		await Promise.all([
			loadOrderItems(payload, order.id, req),
			loadOrderEvents(payload, order.id, req),
			loadOrderShop(payload, order, req),
			loadReturnCaseNumber(payload, order, req),
			audience.kind === "buyer"
				? hasReviewedShop(payload, buyerId, shopId, req)
				: Promise.resolve(false),
		]);

	const actorIds = events
		.map((event) => relationId(event.actor))
		.filter((id): id is string => id !== null);
	const names = await loadUserNames(
		payload,
		buyerId ? [...actorIds, buyerId] : actorIds,
		req,
	);

	return {
		items,
		events,
		shop,
		buyer: { id: buyerId, name: (buyerId && names.get(buyerId)) || null },
		actorNames: names,
		returnCaseNumber,
		conversationId: relationId(order.conversation),
		buyerHasReviewedShop,
	};
}

/** Sums every line's quantity and takes the first line's display fields, for one order's list row. */
function listRowSources(
	shopName: string,
	items: readonly OrderItem[],
): OrderListRowSources {
	const first = [...items].sort(
		(a, b) => (a.lineNumber ?? 0) - (b.lineNumber ?? 0),
	)[0];
	return {
		shopName,
		itemCount: items.reduce((sum, item) => sum + item.quantity, 0),
		firstItemTitle: first?.snapshot?.title ?? "",
		firstItemImageUrl: first?.snapshot?.imageUrl ?? null,
	};
}

/**
 * Every row's items in one query rather than one per row: a page is 20 orders
 * and each row needs its unit count and its first line's title and image.
 */
async function loadItemsByOrder(
	payload: Payload,
	orderIds: readonly string[],
	req?: PayloadRequest,
): Promise<Map<string, OrderItem[]>> {
	const byOrder = new Map<string, OrderItem[]>();
	if (orderIds.length === 0) return byOrder;
	const result = await payload.find({
		collection: "order-items",
		where: { order: { in: [...orderIds] } },
		depth: 0,
		limit: orderIds.length * ORDER_LIST_ITEMS_PER_ORDER,
		overrideAccess: true,
		req,
	});
	for (const item of result.docs as OrderItem[]) {
		const orderId = relationId(item.order);
		if (!orderId) continue;
		const bucket = byOrder.get(orderId);
		if (bucket) bucket.push(item);
		else byOrder.set(orderId, [item]);
	}
	return byOrder;
}

/** Shop names for a buyer's page of orders, which may span as many shops as it has rows. */
async function loadShopNames(
	payload: Payload,
	shopIds: readonly string[],
	req?: PayloadRequest,
): Promise<Map<string, string>> {
	const names = new Map<string, string>();
	const unique = [...new Set(shopIds)].filter((id) => id.length > 0);
	if (unique.length === 0) return names;
	const result = await payload.find({
		collection: "shops",
		where: { id: { in: unique } },
		depth: 0,
		limit: unique.length,
		overrideAccess: true,
		req,
	});
	for (const shop of result.docs) names.set(String(shop.id), shop.name);
	return names;
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
	const [itemsByOrder, shopNames] = await Promise.all([
		loadItemsByOrder(
			payload,
			rows.map((row) => row.id),
		),
		loadShopNames(
			payload,
			rows.map((row) => relationId(row.shop) ?? ""),
		),
	]);

	return {
		docs: rows.map((row) =>
			serializeOrderListEntry(
				row,
				listRowSources(
					shopNames.get(relationId(row.shop) ?? "") ?? "",
					itemsByOrder.get(row.id) ?? [],
				),
				"buyer",
			),
		),
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
	const sources = await loadOrderViewSources(payload, order, audience, req);

	switch (audience.kind) {
		case "buyer":
			return serializeOrderForBuyer(order, sources);
		case "shop":
			return serializeOrderForShop(order, sources, audience.role);
		case "staff":
			return serializeOrderForStaff(order, sources);
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
			withdrawalUntil: order.deadlines?.withdrawalUntil ?? null,
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
	const [counts, itemsByOrder, shopNames] = await Promise.all([
		tabCounts(payload, shopId, query.q, req),
		loadItemsByOrder(
			payload,
			rows.map((row) => row.id),
			req,
		),
		loadShopNames(payload, [shopId], req),
	]);
	const shopName = shopNames.get(shopId) ?? "";

	return {
		docs: rows.map((row) =>
			serializeOrderListEntry(
				row,
				listRowSources(shopName, itemsByOrder.get(row.id) ?? []),
				"shop",
			),
		),
		nextCursor:
			rows.length === ORDER_LIST_PAGE_SIZE
				? rows[rows.length - 1].createdAt
				: null,
		counts,
	};
}

/**
 * The staff order sheet, for the moderation route — `findOrderForModeration`
 * has already loaded and authorised the order, so this is the projection step
 * alone, built from the same sources every other audience's view is.
 */
export async function buildStaffOrderView(
	payload: Payload,
	order: Order,
	req?: PayloadRequest,
): Promise<StaffOrderView> {
	const sources = await loadOrderViewSources(
		payload,
		order,
		{ kind: "staff" },
		req,
	);
	return serializeOrderForStaff(order, sources);
}
