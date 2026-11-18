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
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import { Fragment } from "react";
import { LocaleSwitcher } from "~/components/layout/locale-switcher";
import { ThemeSwitcher } from "~/components/layout/theme-switcher";
import { ShopInitials } from "~/components/shop/shop-initials";
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
import { cn } from "~/lib/utils";
import type { VerificationBadge } from "~/lib/verification";
import type { MyShopRoleReason, ShopRole } from "~/types";
import { OrdersRestrictedNotice } from "./orders-restricted-notice";
import { ShopSwitcher } from "./shop-switcher";

const BADGE_LEVEL: Record<VerificationBadge, number> = {
	phone: 1,
	identity: 2,
	business: 3,
};

const COUNT =
	"ml-auto flex h-5 min-w-[22px] items-center justify-center rounded-[10px] px-1.5 font-bold text-[11px]";

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
		<aside className="flex flex-col border-[var(--shop-sidebar-raised,#1E293B)] border-b bg-[var(--shop-sidebar-bg,#0F172A)] lg:sticky lg:top-0 lg:h-screen lg:w-[248px] lg:shrink-0 lg:border-r lg:border-b-0">
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
			{lockedNotice && (
				<div className="mx-2 mb-2 flex items-start gap-2 rounded-lg bg-white/5 px-3 py-2 text-[#CBD5E1] text-xs">
					<Lock aria-hidden="true" className="mt-0.5 h-3.5 w-3.5 shrink-0" />
					<span>{lockedNotice}</span>
				</div>
			)}
			<OrdersRestrictedNotice
				shopId={shopId}
				role={role}
				ordersEnabled={ordersEnabled}
			/>
			<nav className="flex gap-0.5 overflow-x-auto p-3 lg:flex-col lg:overflow-y-auto">
				{groupSellerNav(items).map(({ group, entries }) => (
					<Fragment key={group}>
						{group !== "main" && (
							<>
								<span className="hidden px-3 pt-4 pb-1 font-semibold text-[#64748B] text-[11px] uppercase tracking-wider lg:block">
									{tShell(`group_${group}`)}
								</span>
								<span
									aria-hidden="true"
									className="mx-1 my-2 w-px shrink-0 bg-white/10 lg:hidden"
								/>
							</>
						)}
						{entries.map(({ href, key }) => {
							const active = activeKey === key;
							const Icon = ICONS[key];
							return (
								<Link
									key={href}
									href={href}
									aria-current={active ? "page" : undefined}
									className={cn(
										"flex h-10 shrink-0 items-center gap-2.5 rounded-lg px-3 font-medium text-sm",
										active
											? "bg-[var(--shop-sidebar-raised,#1E293B)] font-semibold text-white"
											: "text-[#CBD5E1] hover:bg-white/5 hover:text-white",
									)}
								>
									<Icon aria-hidden="true" className="h-[18px] w-[18px]" />
									<span className="flex-1">{tSeller(`nav.${key}`)}</span>
									{key === "orders" && toProcess > 0 && (
										<span
											className={cn(COUNT, "bg-[#F59E0B] text-[#0F172A]")}
											title={tShell("toProcess", { count: toProcess })}
										>
											{toProcess}
										</span>
									)}
									{key === "stock" && lowStock > 0 && (
										<span className={cn(COUNT, "bg-[#7F1D1D] text-[#FECACA]")}>
											{lowStock}
										</span>
									)}
									{key === "inbox" && inboxUnread > 0 && (
										<span className={cn(COUNT, "bg-[#334155] text-white")}>
											{inboxUnread}
										</span>
									)}
									{key === "verification" && level !== null && (
										<span className={cn(COUNT, "bg-[#1E3A8A] text-[#BFDBFE]")}>
											{tShell("level", { level })}
										</span>
									)}
								</Link>
							);
						})}
					</Fragment>
				))}
				{/* Below lg the footer is hidden: its exits ride at the end of the strip. */}
				<span
					aria-hidden="true"
					className="mx-1 my-2 w-px shrink-0 bg-white/10 lg:hidden"
				/>
				<Link
					href={`/s/${handle}`}
					className="flex h-10 shrink-0 items-center gap-2.5 rounded-lg px-3 font-medium text-[#CBD5E1] text-sm hover:bg-white/5 lg:hidden"
				>
					<ExternalLink aria-hidden="true" className="h-[18px] w-[18px]" />
					{tSeller("viewShop")}
				</Link>
				<Link
					href="/"
					className="flex h-10 shrink-0 items-center gap-2.5 rounded-lg px-3 font-medium text-[#FCD34D] text-sm hover:bg-white/5 lg:hidden"
				>
					<ArrowLeftRight aria-hidden="true" className="h-[18px] w-[18px]" />
					{tSeller("buyerMode")}
				</Link>
			</nav>
			<div className="mt-auto hidden flex-col gap-0.5 border-[var(--shop-sidebar-raised,#1E293B)] border-t p-3 lg:flex">
				<Link
					href={`/s/${handle}`}
					className="flex h-10 items-center gap-2.5 rounded-lg px-3 font-medium text-[#CBD5E1] text-sm hover:bg-white/5 hover:text-white"
				>
					<ExternalLink aria-hidden="true" className="h-[18px] w-[18px]" />
					{tSeller("viewShop")}
				</Link>
				<Link
					href="/seller/guide"
					className="flex h-10 items-center gap-2.5 rounded-lg px-3 font-medium text-[#CBD5E1] text-sm hover:bg-white/5 hover:text-white"
				>
					<LifeBuoy aria-hidden="true" className="h-[18px] w-[18px]" />
					{tShell("help")}
				</Link>
				<Link
					href="/"
					className="flex h-10 items-center gap-2.5 rounded-lg px-3 font-medium text-[#FCD34D] text-sm hover:bg-white/5"
				>
					<ArrowLeftRight aria-hidden="true" className="h-[18px] w-[18px]" />
					{tSeller("buyerMode")}
				</Link>
				<div className="flex items-center justify-between gap-2">
					<LocaleSwitcher tone="dark" className="h-10 px-3 text-sm" />
					<ThemeSwitcher tone="dark" className="mr-2" />
				</div>
			</div>
		</aside>
	);
}
