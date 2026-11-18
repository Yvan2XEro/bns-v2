import type { Payload } from "payload";
import { can } from "../../access/shopRoles";
import { timezoneOfShop } from "../../lib/markets";
import { marketMonthBounds } from "../../lib/orderMath";
import { requireShopPermission } from "../shopGuards";
import type { ServiceUser } from "../shops";

/** `GET /api/shops/{id}/delivery-zones/courier-stats`: the partner-courier box. */
export interface CourierStatsView {
	from: string;
	/** Courier shipments created this market month. */
	runs: number;
	/** Of those, the ones that reached a final state, and how many were handed over. */
	finished: number;
	delivered: number;
	/** Null when the caller cannot read costs, or no run carried a cost. */
	averageCourierCost: number | null;
}

const FINAL = new Set(["delivered", "failed", "returned", "cancelled"]);

export async function courierStats(
	payload: Payload,
	user: ServiceUser,
	shopId: string,
	now: Date = new Date(),
): Promise<CourierStatsView> {
	const { shop, role } = await requireShopPermission(
		payload,
		user,
		shopId,
		"settings.edit",
	);
	const month = marketMonthBounds(now, await timezoneOfShop(payload, shop));
	const { docs } = await payload.find({
		collection: "shipments",
		where: {
			and: [
				{ fulfillingShop: { equals: shopId } },
				{ carrier: { equals: "courier" } },
				{ createdAt: { greater_than_equal: month.start } },
				{ createdAt: { less_than: month.end } },
			],
		},
		limit: 0,
		pagination: false,
		depth: 0,
		overrideAccess: true,
	});
	const costs = can(role, "costs.view")
		? docs
				.map((row) => row.courierCost)
				.filter((value): value is number => typeof value === "number")
		: [];
	return {
		from: month.start,
		runs: docs.length,
		finished: docs.filter((row) => FINAL.has(String(row.status))).length,
		delivered: docs.filter((row) => row.status === "delivered").length,
		averageCourierCost: costs.length
			? Math.round(costs.reduce((sum, value) => sum + value, 0) / costs.length)
			: null,
	};
}
