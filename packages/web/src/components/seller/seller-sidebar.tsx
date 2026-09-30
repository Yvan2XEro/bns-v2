"use client";

import {
	ArrowLeftRight,
	Boxes,
	ExternalLink,
	LayoutDashboard,
	MessageCircle,
	Package,
	Settings,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import { LevelBadge } from "~/components/shop/level-badge";
import { ShopInitials } from "~/components/shop/shop-initials";
import { cn } from "~/lib/utils";
import { badgeForLevel } from "~/lib/verification";

// Orders (P4), Resale (P8), Delivery (P7), Payments (P5), Team (P3) and
// Verification (P2) join this list when their phase ships.
const ITEMS = [
	{ href: "/seller", key: "dashboard", icon: LayoutDashboard, exact: true },
	{ href: "/seller/catalogue", key: "catalogue", icon: Package, exact: false },
	{ href: "/seller/stock", key: "stock", icon: Boxes, exact: false },
	{ href: "/messages", key: "messages", icon: MessageCircle, exact: false },
	{ href: "/shop/manage", key: "settings", icon: Settings, exact: false },
] as const;

export function SellerSidebar({
	name,
	handle,
	level,
	logoUrl,
	lowStock,
}: {
	name: string;
	handle: string;
	level: number;
	logoUrl: string | null;
	lowStock: number;
}) {
	const t = useTranslations("Seller");
	const pathname = usePathname();

	const isActive = (href: string, exact?: boolean) =>
		exact
			? pathname === href
			: pathname === href || pathname.startsWith(`${href}/`);

	return (
		<aside className="border-[#E2E8F0] border-b bg-white lg:sticky lg:top-14 lg:h-[calc(100vh-3.5rem)] lg:w-64 lg:shrink-0 lg:border-r lg:border-b-0">
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
				<LevelBadge badge={badgeForLevel(level)} size="sm" />
			</div>
			<nav className="flex gap-1 overflow-x-auto px-2 pb-2 lg:flex-col lg:overflow-visible">
				{ITEMS.map(({ href, key, icon: Icon, exact }) => {
					const active = isActive(href, exact);
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
