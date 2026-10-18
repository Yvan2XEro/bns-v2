import type { ShopRole } from "~/types";
import type { ShopPermission } from "./shop-roles";
import { can } from "./shop-roles";

/**
 * Thirteen flat entries are hard to scan: they are shown in three groups —
 * what was sold, what is sold, and the shop itself — under the dashboard.
 */
export const SELLER_NAV_GROUPS = [
	"main",
	"sales",
	"catalogue",
	"shop",
] as const;
export type SellerNavGroup = (typeof SELLER_NAV_GROUPS)[number];

/**
 * The seller sidebar's entries, in canvas order. `permission: null` means
 * every member sees the entry; anything else is gated with `can`, so staff
 * never see a link to a screen the server would refuse them. `orders`
 * entries also follow the `ordersEnabled` flag. Pages absorbed as tabs
 * (insights, billing, activity, order settings) are reached through
 * `ABSORBED_PREFIXES`, not entries.
 */
export const SELLER_NAV = [
	{
		href: "/seller",
		key: "dashboard",
		group: "main",
		exact: true,
		permission: null,
		orders: false,
	},
	{
		href: "/seller/orders",
		key: "orders",
		group: "sales",
		exact: false,
		permission: "orders.view",
		orders: true,
		retail: true,
	},
	{
		href: "/seller/returns",
		key: "returns",
		group: "sales",
		exact: false,
		permission: "orders.view",
		orders: false,
		retail: true,
	},
	{
		href: "/seller/disputes",
		key: "disputes",
		group: "sales",
		exact: false,
		permission: "orders.view",
		orders: true,
		retail: true,
	},
	{
		href: "/seller/catalogue",
		key: "catalogue",
		group: "catalogue",
		exact: false,
		permission: "catalogue.edit",
		orders: false,
		retail: true,
	},
	{
		// The shop's ads that are not products: a flat, a job offer, a service.
		// Every profile has some; an agency or a recruiter has nothing else.
		href: "/seller/listings",
		key: "listings",
		group: "catalogue",
		exact: false,
		permission: "catalogue.edit",
		orders: false,
	},
	{
		href: "/seller/stock",
		key: "stock",
		group: "catalogue",
		exact: false,
		permission: "stock.move",
		orders: false,
		retail: true,
	},
	{
		href: "/seller/resale",
		key: "resale",
		group: "catalogue",
		exact: false,
		permission: "resale.manage",
		orders: true,
		resale: true,
		retail: true,
	},
	{
		href: "/seller/messages",
		key: "inbox",
		group: "sales",
		exact: false,
		permission: "inbox.reply",
		orders: false,
	},
	{
		href: "/seller/delivery",
		key: "delivery",
		group: "shop",
		exact: false,
		permission: "settings.edit",
		orders: true,
		deliveryZones: true,
		retail: true,
	},
	{
		href: "/seller/payments",
		key: "payments",
		group: "shop",
		exact: false,
		permission: "payments.view",
		orders: false,
		// Payouts and the commission/billing family behind one entry, visible
		// when either surface exists; absorbed tabs gate themselves.
		paymentsHub: true,
	},
	{
		href: "/seller/team",
		key: "team",
		group: "shop",
		exact: false,
		permission: "team.view",
		orders: false,
	},
	{
		href: "/seller/verification",
		key: "verification",
		group: "shop",
		exact: false,
		permission: "verification.submit",
		orders: false,
	},
	{
		// Decision 2: shop settings live in the workspace; /shop/manage 308s here.
		href: "/seller/settings",
		key: "settings",
		group: "shop",
		exact: false,
		permission: "settings.edit",
		orders: false,
	},
] as const satisfies ReadonlyArray<{
	href: string;
	key: string;
	group: SellerNavGroup;
	exact: boolean;
	permission: ShopPermission | null;
	orders: boolean;
	paymentsHub?: boolean;
	resale?: boolean;
	deliveryZones?: boolean;
	/** Only a store runs a catalogue, stock and orders (`shops.profile`). */
	retail?: boolean;
}>;

export type SellerNavEntry = (typeof SELLER_NAV)[number];
export type SellerNavKey = SellerNavEntry["key"];

export function visibleSellerNav(
	role: ShopRole | null,
	ordersEnabled: boolean,
	protectedPaymentEnabled = false,
	resaleEnabled = false,
	deliveryZonesEnabled = false,
	retail = true,
): SellerNavEntry[] {
	return SELLER_NAV.filter((entry) => {
		const retailOnly = "retail" in entry && entry.retail === true;
		const hub = "paymentsHub" in entry && entry.paymentsHub === true;
		const gatedByResale = "resale" in entry && entry.resale === true;
		const gatedByDelivery =
			"deliveryZones" in entry && entry.deliveryZones === true;
		return (
			(ordersEnabled || !entry.orders) &&
			(!hub || ordersEnabled || protectedPaymentEnabled) &&
			(resaleEnabled || !gatedByResale) &&
			(deliveryZonesEnabled || !gatedByDelivery) &&
			(retail || !retailOnly) &&
			(entry.permission === null || can(role, entry.permission))
		);
	});
}

/** Absorbed pages light their parent entry (spec 5); longest prefix wins
 * so /seller/resale/* never falls back to the dashboard. */
const ABSORBED_PREFIXES: ReadonlyArray<readonly [string, SellerNavKey]> = [
	["/seller/insights", "dashboard"], // Decision 3
	["/seller/billing", "payments"], // Decision 4
	["/seller/resale", "resale"],
	["/seller/team/activity", "team"],
	["/seller/settings/orders", "settings"],
];

export function activeNavKey(pathname: string): SellerNavKey | null {
	const candidates: Array<{ prefix: string; key: SellerNavKey }> = [];
	const consider = (prefix: string, key: SellerNavKey, exact: boolean) => {
		const match = exact
			? pathname === prefix
			: pathname === prefix || pathname.startsWith(`${prefix}/`);
		if (match) candidates.push({ prefix, key });
	};
	for (const entry of SELLER_NAV) consider(entry.href, entry.key, entry.exact);
	for (const [prefix, key] of ABSORBED_PREFIXES) consider(prefix, key, false);
	candidates.sort((a, b) => b.prefix.length - a.prefix.length);
	if (candidates[0]) return candidates[0].key;
	return pathname === "/seller" || pathname.startsWith("/seller/")
		? "dashboard"
		: null;
}

/** The visible entries by group, in group order; empty groups are left out. */
export function groupSellerNav(
	entries: SellerNavEntry[],
): { group: SellerNavGroup; entries: SellerNavEntry[] }[] {
	return SELLER_NAV_GROUPS.map((group) => ({
		group,
		entries: entries.filter((entry) => entry.group === group),
	})).filter((section) => section.entries.length > 0);
}
