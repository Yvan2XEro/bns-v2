import type { ShopRole } from "~/types";
import type { ShopPermission } from "./shop-roles";
import { can } from "./shop-roles";

/**
 * The seller sidebar's entries. `permission: null` means every member sees
 * the entry; anything else is gated with `can`, so staff never see a link to
 * a screen the server would refuse them. `orders` entries also follow the
 * `ordersEnabled` flag, which hides every order entry point when it is off.
 * Resale (P8), Delivery (P7) and Payments (P5) join when their phase ships.
 */
export const SELLER_NAV = [
	{
		href: "/seller",
		key: "dashboard",
		exact: true,
		permission: null,
		orders: false,
	},
	{
		href: "/seller/orders",
		key: "orders",
		exact: false,
		permission: "orders.view",
		orders: true,
	},
	{
		href: "/seller/catalogue",
		key: "catalogue",
		exact: false,
		permission: "catalogue.edit",
		orders: false,
	},
	{
		href: "/seller/stock",
		key: "stock",
		exact: false,
		permission: "stock.move",
		orders: false,
	},
	{
		href: "/seller/messages",
		key: "inbox",
		exact: false,
		permission: "inbox.reply",
		orders: false,
	},
	{
		href: "/seller/billing",
		key: "billing",
		exact: false,
		permission: "payments.view",
		orders: true,
	},
	{
		href: "/seller/payments",
		key: "payments",
		exact: false,
		permission: "payments.view",
		orders: false,
		// Absent (falsy) on every other row; visibleSellerNav reads that as "no
		// extra flag gate". This is the only entry `protectedPaymentEnabled`
		// hides on top of its `payments.view` permission check.
		protectedPayment: true,
	},
	{
		href: "/seller/team",
		key: "team",
		exact: false,
		permission: "team.view",
		orders: false,
	},
	{
		href: "/seller/team/activity",
		key: "activity",
		exact: false,
		permission: "activity.view",
		orders: false,
	},
	{
		href: "/seller/verification",
		key: "verification",
		exact: false,
		permission: "verification.submit",
		orders: false,
	},
	{
		href: "/messages",
		key: "messages",
		exact: false,
		permission: null,
		orders: false,
	},
	{
		href: "/shop/manage",
		key: "settings",
		exact: false,
		permission: "settings.edit",
		orders: false,
	},
	{
		href: "/seller/settings/orders",
		key: "orderSettings",
		exact: false,
		permission: "payments.view",
		orders: true,
	},
] as const satisfies ReadonlyArray<{
	href: string;
	key: string;
	exact: boolean;
	permission: ShopPermission | null;
	orders: boolean;
	protectedPayment?: boolean;
}>;

export type SellerNavEntry = (typeof SELLER_NAV)[number];
export type SellerNavKey = SellerNavEntry["key"];

export function visibleSellerNav(
	role: ShopRole | null,
	ordersEnabled: boolean,
	protectedPaymentEnabled = false,
): SellerNavEntry[] {
	return SELLER_NAV.filter((entry) => {
		const gatedByFlag =
			"protectedPayment" in entry ? entry.protectedPayment === true : false;
		return (
			(ordersEnabled || !entry.orders) &&
			(protectedPaymentEnabled || !gatedByFlag) &&
			(entry.permission === null || can(role, entry.permission))
		);
	});
}
