import type { Payload, PayloadRequest, Where } from "payload";
import {
	type OrderAudience,
	type OrderViewer,
	requireOrderAudience,
} from "../../access/orderAccess";
import { mediaUrl } from "../../contracts/media";
import { OUT_FOR_DELIVERY } from "../../contracts/shipments";
import { ERROR_CODES } from "../../lib/errors";
import { timezoneOfOrder } from "../../lib/markets";
import type { ContractSnapshot } from "../../lib/orderContract";
import {
	type OrderStatusName,
	SHOP_ORDER_TABS,
	type ShopOrderTab,
	TAB_STATUSES,
} from "../../lib/orderFormat";
import { renderReceiptHtml } from "../../lib/orderReceipt";
import { relationId } from "../../lib/relationId";
import { ServiceError } from "../../lib/serviceError";
import { shopCapabilities } from "../../lib/shopCapabilities";
import type { Order, OrderEvent, OrderItem, Shop } from "../../payload-types";
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
/** The shop queue's Articles column names this many lines, then "+N". */
const ORDER_LIST_LINES_SHOWN = 3;

export type OrderView = BuyerOrderView | ShopOrderView | StaffOrderView;

export interface OrderPage {
	docs: OrderListEntryView[];
	nextCursor: string | null;
}

export interface ShopOrderPage extends OrderPage {
	counts: Record<ShopOrderTab, number>;
	/** The list header's "paiement à la livraison · livraison dans …". */
	mentions: ShopOrderMentions;
}

export interface ShopOrderMentions {
	codEnabled: boolean;
	sellerDeliveryEnabled: boolean;
}

/**
 * Switches, not amounts: every member who can view orders reads them, unlike
 * the `payments.view`-gated order settings (fees, COD caps).
 */
export function shopOrderMentions(
	shop: Pick<Shop, "orderSettings"> | null | undefined,
): ShopOrderMentions {
	return {
		codEnabled: shop?.orderSettings?.codEnabled === true,
		sellerDeliveryEnabled: shop?.orderSettings?.sellerDeliveryEnabled === true,
	};
}

export interface BuyerOrderListQuery {
	status?: OrderStatusName;
	cursor?: string;
}

/** `all` is the list's "every status" view; it has no count of its own. */
export type ShopOrderListTab = ShopOrderTab | "all";

export interface ShopOrderListQuery {
	tab: ShopOrderListTab;
	q?: string;
	cursor?: string;
	/** A `delivery.district` key, e.g. `douala.makepe`. */
	district?: string;
	/** ISO datetime: only orders created at or after it. */
	since?: string;
}

/**
 * The structured filters, which the tab counts follow; the free-text `q`
 * narrows the rows only, so the counts keep answering "how much work is
 * waiting" while the seller searches.
 */
function shopOrderFilters(
	shopId: string,
	query: Pick<ShopOrderListQuery, "district" | "since">,
): Where[] {
	const and: Where[] = [{ shop: { equals: shopId } }];
	if (query.district) {
		and.push({ "delivery.district": { equals: query.district } });
	}
	if (query.since) and.push({ createdAt: { greater_than_equal: query.since } });
	return and;
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
		logoUrl: mediaUrl(shop.logo, "thumbnail"),
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
	const sorted = [...items].sort(
		(a, b) => (a.lineNumber ?? 0) - (b.lineNumber ?? 0),
	);
	const first = sorted[0];
	return {
		shopName,
		itemCount: items.reduce((sum, item) => sum + item.quantity, 0),
		firstItemTitle: first?.snapshot?.title ?? "",
		firstItemImageUrl: first?.snapshot?.imageUrl ?? null,
		lineCount: items.length,
		lines: sorted.slice(0, ORDER_LIST_LINES_SHOWN).map((item) => ({
			title: item.snapshot?.title ?? "",
			quantity: item.quantity,
		})),
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
async function loadShops(
	payload: Payload,
	shopIds: readonly string[],
	req?: PayloadRequest,
	depth = 0,
): Promise<Map<string, Shop>> {
	const shops = new Map<string, Shop>();
	const unique = [...new Set(shopIds)].filter((id) => id.length > 0);
	if (unique.length === 0) return shops;
	const result = await payload.find({
		collection: "shops",
		where: { id: { in: unique } },
		depth,
		limit: unique.length,
		overrideAccess: true,
		req,
	});
	for (const shop of result.docs) shops.set(String(shop.id), shop);
	return shops;
}

/** Each row's return case number, in one query for the page. */
async function loadReturnCaseNumbers(
	payload: Payload,
	rows: readonly Order[],
): Promise<Map<string, string>> {
	const numbers = new Map<string, string>();
	const ids = [
		...new Set(
			rows
				.map((row) => relationId(row.returnCase))
				.filter((id): id is string => id !== null),
		),
	];
	if (ids.length === 0) return numbers;
	const result = await payload.find({
		collection: "return-cases",
		where: { id: { in: ids } },
		depth: 0,
		limit: ids.length,
		overrideAccess: true,
	});
	for (const returnCase of result.docs) {
		if (returnCase.number)
			numbers.set(String(returnCase.id), returnCase.number);
	}
	return numbers;
}

/** The earliest live courier ETA per order, for the page's orders out for delivery. */
async function loadLiveEtas(
	payload: Payload,
	rows: readonly Order[],
): Promise<Map<string, string>> {
	const etas = new Map<string, string>();
	const ids = rows
		.filter((row) => row.status === "shipped")
		.map((row) => String(row.id));
	if (ids.length === 0) return etas;
	const result = await payload.find({
		collection: "shipments",
		where: {
			and: [
				{ order: { in: ids } },
				{ status: { in: [...OUT_FOR_DELIVERY] } },
				{ courierEta: { exists: true } },
			],
		},
		depth: 0,
		pagination: false,
		overrideAccess: true,
	});
	for (const shipment of result.docs) {
		const orderId = relationId(shipment.order);
		const eta = shipment.courierEta;
		if (!orderId || !eta) continue;
		const known = etas.get(orderId);
		if (!known || Date.parse(eta) < Date.parse(known)) etas.set(orderId, eta);
	}
	return etas;
}

/** `hasReviewedShop` for a whole page: the shops this buyer has already reviewed. */
async function loadReviewedShops(
	payload: Payload,
	buyerId: string,
	shopIds: readonly string[],
): Promise<Set<string>> {
	const unique = [...new Set(shopIds)].filter((id) => id.length > 0);
	if (unique.length === 0) return new Set();
	const result = await payload.find({
		collection: "reviews",
		where: {
			and: [{ reviewer: { equals: buyerId } }, { shop: { in: unique } }],
		},
		depth: 0,
		pagination: false,
		overrideAccess: true,
	});
	return new Set(
		result.docs
			.map((review) => relationId(review.shop))
			.filter((id): id is string => id !== null),
	);
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
	const shopIds = rows.map((row) => relationId(row.shop) ?? "");
	// Depth 1 resolves each card's logo with the page's one shop read.
	const [itemsByOrder, shops, returnCaseNumbers, reviewedShops, liveEtas] =
		await Promise.all([
			loadItemsByOrder(
				payload,
				rows.map((row) => row.id),
			),
			loadShops(payload, shopIds, undefined, 1),
			loadReturnCaseNumbers(payload, rows),
			loadReviewedShops(payload, user.id, shopIds),
			loadLiveEtas(payload, rows),
		]);

	return {
		docs: rows.map((row) => {
			const shopId = relationId(row.shop) ?? "";
			const caseId = relationId(row.returnCase);
			const shop = shops.get(shopId);
			return serializeOrderListEntry(
				row,
				listRowSources(shop?.name ?? "", itemsByOrder.get(row.id) ?? []),
				"buyer",
				{
					returnCaseNumber: caseId
						? (returnCaseNumbers.get(caseId) ?? null)
						: null,
					buyerHasReviewedShop: reviewedShops.has(shopId),
					shopLogoUrl: mediaUrl(shop?.logo, "thumbnail"),
					shopBadge: shop ? shopCapabilities(shop).badge : null,
					liveEta: liveEtas.get(String(row.id)) ?? null,
				},
			);
		}),
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
			timezone: await timezoneOfOrder(payload, order),
		},
		lang,
	);
}

/**
 * Each tab's count under the structured filters (district, period) the rows
 * share. The free-text search is deliberately not among them: the counts
 * say how much work is waiting, which a search for one order does not change.
 */
async function tabCounts(
	payload: Payload,
	filters: Where[],
	req?: PayloadRequest,
): Promise<Record<ShopOrderTab, number>> {
	const counts = {} as Record<ShopOrderTab, number>;
	for (const tab of SHOP_ORDER_TABS) {
		const result = await payload.count({
			collection: "orders",
			where: {
				and: [...filters, { status: { in: TAB_STATUSES[tab] } }],
			},
			overrideAccess: true,
			req,
		});
		counts[tab] = result.totalDocs;
	}
	return counts;
}

/**
 * The first resold line of each row, with its purchase order's number once
 * one was sent. The supplier is the line's `fulfillingShop` whenever that is
 * not the storefront itself.
 */
async function loadResaleByOrder(
	payload: Payload,
	itemsByOrder: Map<string, OrderItem[]>,
	storefrontId: string,
	req?: PayloadRequest,
): Promise<{
	byOrder: Map<
		string,
		{ purchaseOrderNumber: string | null; supplierId: string | null }
	>;
	supplierIds: string[];
}> {
	const firstResale = new Map<string, OrderItem>();
	for (const [orderId, items] of itemsByOrder) {
		const line = [...items]
			.sort((a, b) => (a.lineNumber ?? 0) - (b.lineNumber ?? 0))
			.find((item) => item.sourcing === "resale");
		if (line) firstResale.set(orderId, line);
	}
	const poIds = [...firstResale.values()]
		.map((item) => relationId(item.purchaseOrder))
		.filter((id): id is string => id !== null);
	const poNumbers = new Map<string, string>();
	if (poIds.length > 0) {
		const result = await payload.find({
			collection: "purchase-orders",
			where: { id: { in: [...new Set(poIds)] } },
			depth: 0,
			limit: poIds.length,
			overrideAccess: true,
			req,
		});
		for (const po of result.docs) poNumbers.set(String(po.id), po.number);
	}
	const byOrder = new Map<
		string,
		{ purchaseOrderNumber: string | null; supplierId: string | null }
	>();
	const supplierIds = new Set<string>();
	for (const [orderId, item] of firstResale) {
		const fulfilling = relationId(item.fulfillingShop);
		const supplierId =
			fulfilling && fulfilling !== storefrontId ? fulfilling : null;
		if (supplierId) supplierIds.add(supplierId);
		const poId = relationId(item.purchaseOrder);
		byOrder.set(orderId, {
			purchaseOrderNumber: poId ? (poNumbers.get(poId) ?? null) : null,
			supplierId,
		});
	}
	return { byOrder, supplierIds: [...supplierIds] };
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

	const filters = shopOrderFilters(shopId, query);
	const and: Where[] = [...filters];
	if (query.tab !== "all") {
		and.push({ status: { in: TAB_STATUSES[query.tab] } });
	}
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
	const [counts, itemsByOrder] = await Promise.all([
		tabCounts(payload, filters, req),
		loadItemsByOrder(
			payload,
			rows.map((row) => row.id),
			req,
		),
	]);
	const resaleByOrder = await loadResaleByOrder(
		payload,
		itemsByOrder,
		shopId,
		req,
	);
	const shops = await loadShops(
		payload,
		[shopId, ...resaleByOrder.supplierIds],
		req,
	);
	const shopNames = new Map(
		[...shops].map(([id, shop]) => [id, shop.name] as const),
	);
	const shopName = shopNames.get(shopId) ?? "";

	return {
		docs: rows.map((row) => {
			const resale = resaleByOrder.byOrder.get(row.id);
			return serializeOrderListEntry(
				row,
				{
					...listRowSources(shopName, itemsByOrder.get(row.id) ?? []),
					resale: resale
						? {
								purchaseOrderNumber: resale.purchaseOrderNumber,
								supplierName: resale.supplierId
									? (shopNames.get(resale.supplierId) ?? null)
									: null,
							}
						: null,
				},
				"shop",
			);
		}),
		nextCursor:
			rows.length === ORDER_LIST_PAGE_SIZE
				? rows[rows.length - 1].createdAt
				: null,
		counts,
		mentions: shopOrderMentions(shops.get(shopId)),
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
