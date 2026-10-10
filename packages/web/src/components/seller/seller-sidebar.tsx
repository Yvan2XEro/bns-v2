"use client";

import {
	ArrowLeftRight,
	BadgeCheck,
	Boxes,
	ExternalLink,
	Inbox,
	LayoutDashboard,
	Lock,
	type LucideIcon,
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
import { LevelBadge } from "~/components/shop/level-badge";
import { ShopInitials } from "~/components/shop/shop-initials";
import { useAppConfig } from "~/hooks/use-app-config";
import { useMyShops } from "~/hooks/use-my-shops";
import {
	activeNavKey,
	type SellerNavKey,
	visibleSellerNav,
} from "~/lib/seller-nav";
import { cn } from "~/lib/utils";
import type { VerificationBadge } from "~/lib/verification";
import type { MyShopRoleReason, ShopRole } from "~/types";
import { OrdersRestrictedNotice } from "./orders-restricted-notice";

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
}) {
	const t = useTranslations("Seller");
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
	const items = visibleSellerNav(
		role,
		ordersEnabled,
		protectedPaymentEnabled,
		resaleEnabled,
		deliveryZonesEnabled,
	);

	const lockedNotice =
		!role && roleReason
			? roleReason === "accountSuspended"
				? tRoot("ApiErrors.moderation.accountSuspended")
				: t(`hubLocked.${roleReason}`)
			: null;

	return (
		<aside className="border-[#E2E8F0] border-b bg-white lg:sticky lg:top-0 lg:h-screen lg:w-64 lg:shrink-0 lg:border-r lg:border-b-0">
			<div className="flex items-center gap-3 p-4">
				<ShopInitials
					name={name}
					logoUrl={logoUrl}
					className="h-10 w-10 rounded-xl text-sm"
				/>
				<div className="min-w-0">
					<p className="truncate font-bold text-[#0F172A] text-sm">{name}</p>
					<p className="text-[#64748B] text-xs">{t("space")}</p>
				</div>
			</div>
			<div className="px-4 pb-2">
				<LevelBadge badge={badge} size="sm" />
			</div>
			{lockedNotice && (
				<div className="mx-2 mb-2 flex items-start gap-2 rounded-lg bg-[#F1F5F9] px-3 py-2 text-[#475569] text-xs">
					<Lock aria-hidden="true" className="mt-0.5 h-3.5 w-3.5 shrink-0" />
					<span>{lockedNotice}</span>
				</div>
			)}
			<OrdersRestrictedNotice
				shopId={shopId}
				role={role}
				ordersEnabled={ordersEnabled}
			/>
			<nav className="flex gap-1 overflow-x-auto px-2 pb-2 lg:flex-col lg:overflow-visible">
				{items.map(({ href, key }) => {
					const active = activeKey === key;
					const Icon = ICONS[key];
					return (
						<Link
							key={href}
							href={href}
							aria-current={active ? "page" : undefined}
							className={cn(
								"flex shrink-0 items-center gap-3 rounded-lg px-3 py-2 font-medium text-sm",
								active
									? "bg-[#EFF6FF] text-[#1E40AF]"
									: "text-[#334155] hover:bg-[#F8FAFC]",
							)}
						>
							<Icon aria-hidden="true" className="h-4 w-4" />
							<span className="flex-1">{t(`nav.${key}`)}</span>
							{key === "stock" && lowStock > 0 && (
								<span className="rounded-full bg-[#fef3c7] px-1.5 font-semibold text-[#92400e] text-[11px]">
									{lowStock}
								</span>
							)}
							{key === "inbox" && inboxUnread > 0 && (
								<span className="rounded-full bg-[#1E40AF] px-1.5 font-semibold text-[11px] text-white">
									{inboxUnread}
								</span>
							)}
						</Link>
					);
				})}
			</nav>
			<div className="hidden space-y-1 border-[#E2E8F0] border-t p-2 lg:block">
				<Link
					href={`/s/${handle}`}
					className="flex items-center gap-3 rounded-lg px-3 py-2 text-[#334155] text-sm hover:bg-[#F8FAFC]"
				>
					<ExternalLink aria-hidden="true" className="h-4 w-4" />
					{t("viewShop")}
				</Link>
				<Link
					href="/"
					className="flex items-center gap-3 rounded-lg px-3 py-2 text-[#334155] text-sm hover:bg-[#F8FAFC]"
				>
					<ArrowLeftRight aria-hidden="true" className="h-4 w-4" />
					{t("buyerMode")}
				</Link>
			</div>
		</aside>
	);
}
