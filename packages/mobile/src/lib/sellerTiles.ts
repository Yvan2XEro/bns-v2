import type { ShopRole } from "../types/api";
import { can, type ShopPermission } from "./shopRoles";

export interface SellerTile {
	key: string;
	href: string;
	permission: ShopPermission | null;
	badge?: number;
}

/** `orders` tiles follow the `ordersEnabled` flag, like web's seller nav. */
const TILES: ReadonlyArray<{
	key: string;
	href: string;
	permission: ShopPermission;
	orders?: true;
}> = [
	{
		key: "orders",
		href: "/seller/orders",
		permission: "orders.view",
		orders: true,
	},
	{ key: "catalogue", href: "/seller/catalogue", permission: "catalogue.edit" },
	{ key: "stock", href: "/seller/stock-adjust", permission: "stock.move" },
	{ key: "inbox", href: "/seller/inbox", permission: "inbox.reply" },
	{
		key: "billing",
		href: "/seller/billing",
		permission: "payments.view",
		orders: true,
	},
	{
		key: "payments",
		href: "/seller/payments",
		permission: "payments.view",
		orders: true,
	},
	{ key: "team", href: "/seller/team", permission: "team.view" },
	{ key: "activity", href: "/seller/activity", permission: "activity.view" },
	{ key: "settings", href: "/shop/manage", permission: "settings.edit" },
	{
		key: "verification",
		href: "/seller/verification",
		permission: "verification.submit",
	},
];

export interface SellerTileCounts {
	inboxUnread: number;
	lowStock: number;
	/** `counts.to_accept` off the shop's order list. */
	toAccept?: number;
	/** The payments view's own `holds.length` — see `sellerPaymentsActionCount`. */
	paymentsHolds?: number;
}

/** A zero badge is omitted, not rendered: "0" beside a tile reads as broken. */
export function visibleSellerTiles(
	role: ShopRole | null | undefined,
	counts: SellerTileCounts,
	options: { ordersEnabled: boolean } = { ordersEnabled: false },
): SellerTile[] {
	const badges: Record<string, number> = {
		inbox: counts.inboxUnread,
		stock: counts.lowStock,
		orders: counts.toAccept ?? 0,
		payments: counts.paymentsHolds ?? 0,
	};
	return TILES.filter(
		(tile) =>
			(!tile.orders || options.ordersEnabled) && can(role, tile.permission),
	).map(({ key, href, permission }) => {
		const badge = badges[key] ?? 0;
		return { key, href, permission, ...(badge > 0 ? { badge } : {}) };
	});
}

/** Whether the hub should read the order list at all, for the to-accept badge. */
export function showsOrdersTile(
	role: ShopRole | null | undefined,
	ordersEnabled: boolean,
): boolean {
	return ordersEnabled && can(role, "orders.view");
}
