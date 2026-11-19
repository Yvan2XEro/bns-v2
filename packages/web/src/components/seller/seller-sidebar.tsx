"use client";

import {
	ArrowLeftRight,
	BadgeCheck,
	Boxes,
	ExternalLink,
	Inbox,
	LayoutDashboard,
	LifeBuoy,
	Lock,
	type LucideIcon,
	Megaphone,
	Package,
	RefreshCw,
	RotateCcw,
	Scale,
	Settings,
	ShoppingBag,
	Truck,
	Users,
	Wallet,
} from "lucide-react";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import { Fragment } from "react";
import { ShopInitials } from "~/components/shop/shop-initials";
import {
	WorkspaceNavGroup,
	WorkspaceNavLink,
	WorkspaceSidebar,
} from "~/components/workspace/workspace-sidebar";
import { useAppConfig } from "~/hooks/use-app-config";
import { useMyShops } from "~/hooks/use-my-shops";
import {
	useNewOrdersRefresh,
	useSellerOrderQueue,
} from "~/hooks/use-seller-orders";
import { useTitleCount } from "~/hooks/use-title-count";
import {
	activeNavKey,
	groupSellerNav,
	type SellerNavKey,
	visibleSellerNav,
} from "~/lib/seller-nav";
import { can } from "~/lib/shop-roles";
import type { VerificationBadge } from "~/lib/verification";
import type { MyShopRoleReason, ShopRole } from "~/types";
import { OrdersRestrictedNotice } from "./orders-restricted-notice";
import { ShopSwitcher } from "./shop-switcher";

const BADGE_LEVEL: Record<VerificationBadge, number> = {
	phone: 1,
	identity: 2,
	business: 3,
};

const ICONS: Record<SellerNavKey, LucideIcon> = {
	dashboard: LayoutDashboard,
	orders: ShoppingBag,
	catalogue: Package,
	stock: Boxes,
	inbox: Inbox,
	payments: Wallet,
	team: Users,
	verification: BadgeCheck,
	settings: Settings,
	disputes: Scale,
	returns: RotateCcw,
	resale: RefreshCw,
	delivery: Truck,
	listings: Megaphone,
};

export function SellerSidebar({
	shopId,
	name,
	handle,
	badge,
	logoUrl,
	lowStock,
	role,
	roleReason,
	retail,
}: {
	shopId: string;
	name: string;
	handle: string;
	/** The server's computed, expiry-aware badge — never `badgeForLevel(level)`,
	 * which would still show "identity verified" after a level-3 approval
	 * expires and before the nightly job catches up. */
	badge: VerificationBadge | null;
	logoUrl: string | null;
	lowStock: number;
	role: ShopRole | null;
	/** Why `role` is null despite an active membership — `null` when `role`
	 * itself is set. Explains the links `can` just filtered out, so a
	 * dormant or sanctioned member sees a reason instead of a sidebar that
	 * quietly lost most of its entries. */
	roleReason: MyShopRoleReason | null;
	/** A store; an agency, a recruiter or a provider has no catalogue or orders. */
	retail: boolean;
}) {
	const tSeller = useTranslations("Seller");
	const tShell = useTranslations("SellerShell");
	const tRoot = useTranslations();
	const pathname = usePathname();
	const { data: myShops } = useMyShops();
	const inboxUnread =
		myShops?.find((entry) => entry.shopId === shopId)?.inboxUnread ?? 0;

	const activeKey = activeNavKey(pathname);

	const {
		ordersEnabled,
		protectedPaymentEnabled,
		resaleEnabled,
		deliveryZonesEnabled,
	} = useAppConfig();
	const queue = useSellerOrderQueue(
		ordersEnabled && can(role, "orders.view") ? shopId : null,
	);
	const toProcess = (queue.data?.toAccept ?? 0) + (queue.data?.toShip ?? 0);
	useNewOrdersRefresh(queue.data ? shopId : null, queue.data?.toAccept);
	// Only orders waiting for acceptance have a clock running.
	useTitleCount(queue.data?.toAccept ?? 0);
	const level = badge ? BADGE_LEVEL[badge] : null;
	const items = visibleSellerNav(
		role,
		ordersEnabled,
		protectedPaymentEnabled,
		resaleEnabled,
		deliveryZonesEnabled,
		retail,
	);

	const lockedNotice =
		!role && roleReason
			? roleReason === "accountSuspended"
				? tRoot("ApiErrors.moderation.accountSuspended")
				: tSeller(`hubLocked.${roleReason}`)
			: null;

	return (
		<WorkspaceSidebar
			header={
				<ShopSwitcher activeShopId={shopId}>
					<ShopInitials
						name={name}
						logoUrl={logoUrl}
						className="h-[38px] w-[38px] rounded-[10px] bg-[var(--shop-sidebar-raised,#1E293B)] font-extrabold text-[#F59E0B] text-sm"
					/>
					<span className="flex min-w-0 flex-1 flex-col">
						<span className="truncate font-bold text-[15px] text-white">
							{name}
						</span>
						<span className="text-[#94A3B8] text-xs">{tSeller("space")}</span>
					</span>
				</ShopSwitcher>
			}
			notices={
				<>
					{lockedNotice && (
						<div className="mx-2 mb-2 flex items-start gap-2 rounded-lg bg-white/5 px-3 py-2 text-[#CBD5E1] text-xs">
							<Lock
								aria-hidden="true"
								className="mt-0.5 h-3.5 w-3.5 shrink-0"
							/>
							<span>{lockedNotice}</span>
						</div>
					)}
					<OrdersRestrictedNotice
						shopId={shopId}
						role={role}
						ordersEnabled={ordersEnabled}
					/>
				</>
			}
			exits={[
				{
					href: `/s/${handle}`,
					label: tSeller("viewShop"),
					icon: ExternalLink,
				},
				{ href: "/seller/guide", label: tShell("help"), icon: LifeBuoy },
				{
					href: "/",
					label: tSeller("buyerMode"),
					icon: ArrowLeftRight,
					highlight: true,
				},
			]}
		>
			{groupSellerNav(items).map(({ group, entries }) => (
				<Fragment key={group}>
					{group !== "main" && (
						<WorkspaceNavGroup label={tShell(`group_${group}`)} />
					)}
					{entries.map(({ href, key }) => (
						<WorkspaceNavLink
							key={href}
							href={href}
							icon={ICONS[key]}
							label={tSeller(`nav.${key}`)}
							active={activeKey === key}
							{...countFor(key)}
						/>
					))}
				</Fragment>
			))}
		</WorkspaceSidebar>
	);

	function countFor(key: SellerNavKey) {
		if (key === "orders" && toProcess > 0) {
			return {
				count: toProcess,
				countClassName: "bg-[#F59E0B] text-[#0F172A]",
				countTitle: tShell("toProcess", { count: toProcess }),
			};
		}
		if (key === "stock" && lowStock > 0) {
			return { count: lowStock, countClassName: "bg-[#7F1D1D] text-[#FECACA]" };
		}
		if (key === "inbox" && inboxUnread > 0) {
			return { count: inboxUnread, countClassName: "bg-[#334155] text-white" };
		}
		if (key === "verification" && level !== null) {
			return {
				count: tShell("level", { level }),
				countClassName: "bg-[#1E3A8A] text-[#BFDBFE]",
			};
		}
		return {};
	}
}
