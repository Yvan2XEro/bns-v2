import type { Payload, PayloadRequest } from "payload";
import { can } from "../../access/shopRoles";
import { TAB_STATUSES } from "../../lib/orderFormat";
import type { Order } from "../../payload-types";
import { requireShopPermission } from "../shopGuards";
import type { ServiceUser } from "../shops";

export interface ShopOrderQueueView {
	toAccept: number;
	toShip: number;
}

export interface ShopOrderWeekView {
	since: string;
	orders: number;
	delivered: number;
	refused: number;
	/** Items only: the delivery fee goes to whoever delivered. */
	deliveredSales: number;
	/** `payments.view` only; null for anyone else. */
	commission: { amount: number; rateBps: number | null } | null;
}

export const ORDER_WEEK_DAYS = 7;
const DAY_MS = 24 * 60 * 60 * 1000;

/** The two counts the seller sidebar and the dashboard cards show. */
export async function getShopOrderQueue(
	payload: Payload,
	user: ServiceUser,
	shopId: string,
	req?: PayloadRequest,
): Promise<ShopOrderQueueView> {
	await requireShopPermission(payload, user, shopId, "orders.view", { req });
	const count = async (statuses: readonly string[]) =>
		(
			await payload.count({
				collection: "orders",
				where: {
					and: [{ shop: { equals: shopId } }, { status: { in: statuses } }],
				},
				overrideAccess: true,
				req,
			})
		).totalDocs;
	const [toAccept, toShip] = await Promise.all([
		count(TAB_STATUSES.to_accept),
		count(TAB_STATUSES.to_ship),
	]);
	return { toAccept, toShip };
}

/**
 * The dashboard's rolling seven days. Each figure keys off the moment its own
 * event happened (placed, delivered, failed), not off when the order was
 * placed, so an order placed last week and delivered yesterday counts as
 * delivered this week.
 */
export async function getShopOrderWeek(
	payload: Payload,
	user: ServiceUser,
	shopId: string,
	now: Date = new Date(),
	req?: PayloadRequest,
): Promise<ShopOrderWeekView> {
	const { role } = await requireShopPermission(
		payload,
		user,
		shopId,
		"orders.view",
		{ req },
	);
	const since = new Date(
		now.getTime() - ORDER_WEEK_DAYS * DAY_MS,
	).toISOString();
	const shop = { shop: { equals: shopId } };

	const [placed, delivered, refused] = await Promise.all([
		payload.count({
			collection: "orders",
			where: { and: [shop, { createdAt: { greater_than_equal: since } }] },
			overrideAccess: true,
			req,
		}),
		payload.find({
			collection: "orders",
			where: {
				and: [
					shop,
					{ status: { in: ["delivered", "completed"] } },
					{ "timestamps.deliveredAt": { greater_than_equal: since } },
				],
			},
			depth: 0,
			pagination: false,
			overrideAccess: true,
			req,
		}),
		payload.count({
			collection: "orders",
			where: {
				and: [
					shop,
					{ status: { equals: "delivery_failed" } },
					{ "deliveryFailure.reason": { equals: "refused" } },
					{ "timestamps.failedAt": { greater_than_equal: since } },
				],
			},
			overrideAccess: true,
			req,
		}),
	]);

	const rows = delivered.docs as Order[];
	const deliveredSales = rows.reduce(
		(sum, order) =>
			sum + (order.amounts?.subtotal ?? 0) - (order.amounts?.discount ?? 0),
		0,
	);
	let commission: ShopOrderWeekView["commission"] = null;
	if (can(role, "payments.view")) {
		const rates = new Set(
			rows
				.map((order) => order.commission?.rateBps)
				.filter((rate): rate is number => typeof rate === "number"),
		);
		commission = {
			amount: rows.reduce(
				(sum, order) => sum + (order.commission?.amount ?? 0),
				0,
			),
			rateBps: rates.size === 1 ? [...rates][0] : null,
		};
	}

	return {
		since,
		orders: placed.totalDocs,
		delivered: rows.length,
		refused: refused.totalDocs,
		deliveredSales,
		commission,
	};
}
