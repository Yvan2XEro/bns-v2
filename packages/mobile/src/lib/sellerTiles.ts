import type { ShopRole } from "../types/api";
import { can, type ShopPermission } from "./shopRoles";

export interface SellerTile {
	key: string;
	href: string;
	permission: ShopPermission | null;
	badge?: number;
}

const TILES: ReadonlyArray<{
	key: string;
	href: string;
	permission: ShopPermission;
}> = [
	{ key: "catalogue", href: "/seller/catalogue", permission: "catalogue.edit" },
	{ key: "stock", href: "/seller/stock-adjust", permission: "stock.move" },
	{ key: "inbox", href: "/seller/inbox", permission: "inbox.reply" },
	{ key: "team", href: "/seller/team", permission: "team.view" },
	{ key: "activity", href: "/seller/activity", permission: "activity.view" },
	{ key: "settings", href: "/shop/manage", permission: "settings.edit" },
	{
		key: "verification",
		href: "/seller/verification",
		permission: "verification.submit",
	},
];

/** A zero badge is omitted, not rendered: "0" beside a tile reads as broken. */
export function visibleSellerTiles(
	role: ShopRole | null | undefined,
	counts: { inboxUnread: number; lowStock: number },
): SellerTile[] {
	return TILES.filter((tile) => can(role, tile.permission)).map((tile) => {
		const badge =
			tile.key === "inbox"
				? counts.inboxUnread
				: tile.key === "stock"
					? counts.lowStock
					: 0;
		return { ...tile, ...(badge > 0 ? { badge } : {}) };
	});
}
