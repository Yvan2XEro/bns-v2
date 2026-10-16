import { BadgeCheck, Plus } from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { SectionTabs } from "~/components/seller/section-tabs";
import { ShareShopButton } from "~/components/shop/share-shop-button";
import { serverGet } from "~/lib/server-api";
import { getMyShop } from "~/lib/server-shop";
import { can } from "~/lib/shop-roles";
import { SellerHome } from "./seller-home";
import { DashboardSubtitle } from "./today-cards";

export default async function SellerDashboardPage() {
	const [mine, config, tSeller, tDash] = await Promise.all([
		getMyShop(),
		serverGet<{ insightsEnabled?: boolean; ordersEnabled?: boolean }>(
			"/api/public/config",
		),
		getTranslations("Seller"),
		getTranslations("SellerDashboard"),
	]);
	const shop = mine?.shop;
	if (!shop) redirect("/shop/new");
	// Decision 3's tab row only when /seller/insights would let the viewer in
	// (its page's own gate) — staff and flag-off shops otherwise get a tab that
	// silently bounces back here.
	const statisticsReachable =
		config?.insightsEnabled === true &&
		(mine.role === "owner" || mine.role === "manager");
	const counts = mine?.counts ?? {
		activeProducts: 0,
		draftProducts: 0,
		lowStockVariants: 0,
		lowStockSample: null,
		personalListings: 0,
	};

	// A suspended shop cannot publish and its public page is hidden, so the
	// actions that would lead there are left out rather than shown as usual.
	const suspended = shop.status === "suspended";
	const canViewOrders = can(mine.role, "orders.view");
	const showOrders =
		!suspended && canViewOrders && config?.ordersEnabled === true;
	const pending = {
		shopId: shop.id,
		canViewOrders,
		canReply: can(mine.role, "inbox.reply"),
		lowStock: counts.lowStockVariants,
	};
	// The design's nudge is for a level-2 shop: business verification is what
	// unlocks supplying resellers.
	const nudgeLevel3 =
		!suspended &&
		shop.badge === "identity" &&
		can(mine.role, "verification.submit");

	return (
		<div className="space-y-[22px]">
			{statisticsReachable && (
				<SectionTabs
					tabs={[
						{ href: "/seller", label: tSeller("tabs.today"), exact: true },
						{ href: "/seller/insights", label: tSeller("tabs.statistics") },
					]}
				/>
			)}
			<div className="flex flex-wrap items-end justify-between gap-3">
				<div className="space-y-1">
					<h1 className="font-extrabold text-[#0F172A] text-[28px] tracking-[-0.4px]">
						{tSeller("dashboard")}
					</h1>
					{suspended ? (
						<p className="text-[#64748B] text-sm">{shop.name}</p>
					) : (
						<DashboardSubtitle {...pending} />
					)}
				</div>
				{!suspended && (
					<div className="flex gap-2.5">
						<ShareShopButton
							handle={shop.handle}
							name={shop.name}
							label={tSeller("shareShop")}
						/>
						<Link
							href="/seller/catalogue/new"
							className="inline-flex h-10 items-center gap-2 rounded-lg bg-[var(--shop-accent,#1E40AF)] px-4 font-semibold text-[var(--shop-on-accent,#FFFFFF)] text-sm hover:bg-[var(--shop-accent-hover,#1E3A8A)]"
						>
							<Plus aria-hidden="true" className="h-4 w-4" />
							{tSeller("addProduct")}
						</Link>
					</div>
				)}
			</div>

			{!suspended && (
				<SellerHome
					handle={shop.handle}
					name={shop.name}
					pending={pending}
					showOrders={showOrders}
					aside={
						nudgeLevel3 ? (
							<section className="flex flex-col gap-2 rounded-xl border border-[var(--shop-accent-border,#BFDBFE)] bg-[var(--shop-accent-soft,#EFF6FF)] p-4">
								<span className="inline-flex items-center gap-1 self-start rounded-full bg-[var(--shop-accent-soft,#DBEAFE)] py-[3px] pr-[9px] pl-1.5 font-semibold text-[var(--shop-accent-text,#1E40AF)] text-xs">
									<BadgeCheck
										aria-hidden="true"
										className="h-[13px] w-[13px]"
									/>
									{tDash("level2Badge")}
								</span>
								<h2 className="font-bold text-[#0F172A] text-base">
									{tDash("level3Title")}
								</h2>
								<p className="text-[#334155] text-sm leading-5">
									{tDash("level3Body")}
								</p>
								<Link
									href="/seller/verification/business"
									className="font-semibold text-[var(--shop-accent-text,#1E40AF)] text-sm hover:underline"
								>
									{tDash("level3Action")}
								</Link>
							</section>
						) : null
					}
				/>
			)}
		</div>
	);
}
