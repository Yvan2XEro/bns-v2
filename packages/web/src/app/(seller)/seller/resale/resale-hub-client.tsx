"use client";

import { Plus, ScrollText } from "lucide-react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import type { ReactNode } from "react";
import { useShopPurchaseOrders } from "~/hooks/use-purchase-orders";
import {
	useResaleLinks,
	useResoldListings,
	useSupplierResaleProducts,
} from "~/hooks/use-resale";
import { type ResaleTab, type ResaleView, resaleHref } from "~/lib/resale-hub";
import { cn } from "~/lib/utils";
import { OfferProductPicker } from "./_components/offer-product-picker";
import { ResoldTab } from "./_components/resold-tab";
import { SupplierOrdersTab } from "./_components/supplier-orders-tab";
import { ResaleCatalogueClient } from "./catalogue/resale-catalogue-client";
import { ResaleLinksClient } from "./links/resale-links-client";
import { ResaleOfferedClient } from "./offered/resale-offered-client";

export function ResaleHubClient({
	shopId,
	view,
	tab,
	supplierCapable,
	supplierFilter,
}: {
	shopId: string;
	view: ResaleView;
	tab: ResaleTab;
	supplierCapable: boolean;
	supplierFilter: string;
}) {
	return view === "supplier" ? (
		<SupplierHub shopId={shopId} tab={tab} />
	) : (
		<ResellerHub
			shopId={shopId}
			tab={tab}
			supplierCapable={supplierCapable}
			supplierFilter={supplierFilter}
		/>
	);
}

function ResellerHub({
	shopId,
	tab,
	supplierCapable,
	supplierFilter,
}: {
	shopId: string;
	tab: ResaleTab;
	supplierCapable: boolean;
	supplierFilter: string;
}) {
	const t = useTranslations("SellerResaleHub");
	const resold = useResoldListings(shopId);
	const suppliers = useResaleLinks(shopId, "reseller", "all");
	return (
		<section className="space-y-5">
			<HubHeader
				title={t("resellerTitle")}
				subtitle={t("resellerSubtitle")}
				actions={supplierCapable ? <ViewSwitch view="reseller" /> : null}
			/>
			<Tabs
				label={t("resellerTabs")}
				items={[
					{ tab: "find", label: t("tabFind"), count: null },
					{
						tab: "resold",
						label: t("tabResold"),
						count: resold.data?.listings.length ?? null,
					},
					{
						tab: "suppliers",
						label: t("tabSuppliers"),
						count: suppliers.data?.totalDocs ?? null,
					},
				]}
				view="reseller"
				active={tab}
			/>
			{tab === "resold" ? (
				<ResoldTab shopId={shopId} />
			) : tab === "suppliers" ? (
				<ResaleLinksClient shopId={shopId} side="reseller" embedded />
			) : (
				<ResaleCatalogueClient shopId={shopId} supplier={supplierFilter} />
			)}
		</section>
	);
}

function SupplierHub({ shopId, tab }: { shopId: string; tab: ResaleTab }) {
	const t = useTranslations("SellerResaleHub");
	const orders = useShopPurchaseOrders(shopId, { side: "supplier" });
	const toShip = useShopPurchaseOrders(shopId, {
		side: "supplier",
		due: "today",
	});
	const resellers = useResaleLinks(shopId, "supplier", "approved");
	const offered = useSupplierResaleProducts(shopId);
	const resellerCount = resellers.data?.totalDocs ?? 0;
	const toShipCount = toShip.data?.pages[0]?.totalDocs ?? 0;
	return (
		<section className="space-y-5">
			<HubHeader
				title={t("supplierTitle")}
				subtitle={t("supplierSubtitle", {
					resellers: resellerCount,
					toShip: toShipCount,
				})}
				actions={
					<>
						<ViewSwitch view="supplier" />
						<Link
							href={`${resaleHref("supplier", "orders")}#resale-rules`}
							className="inline-flex h-10 items-center gap-2 rounded-lg border border-line bg-surface px-4 font-semibold text-ink text-sm hover:bg-canvas"
						>
							<ScrollText aria-hidden="true" className="h-4 w-4" />
							{t("rulesButton")}
						</Link>
						<OfferProductPicker shopId={shopId}>
							<Plus aria-hidden="true" className="h-4 w-4" />
							{t("offerProduct")}
						</OfferProductPicker>
					</>
				}
			/>
			<Tabs
				label={t("supplierTabs")}
				items={[
					{
						tab: "orders",
						label: t("tabOrders"),
						count: orders.data?.pages[0]?.totalDocs ?? null,
					},
					{
						tab: "resellers",
						label: t("tabResellers"),
						count: resellers.data?.totalDocs ?? null,
					},
					{
						tab: "offered",
						label: t("tabOffered"),
						count: offered.data?.products.length ?? null,
					},
				]}
				view="supplier"
				active={tab}
			/>
			{tab === "resellers" ? (
				<ResaleLinksClient shopId={shopId} side="supplier" embedded />
			) : tab === "offered" ? (
				<ResaleOfferedClient shopId={shopId} embedded />
			) : (
				<SupplierOrdersTab shopId={shopId} />
			)}
		</section>
	);
}

function HubHeader({
	title,
	subtitle,
	actions,
}: {
	title: string;
	subtitle: string;
	actions: ReactNode;
}) {
	return (
		<header className="flex flex-wrap items-end justify-between gap-4">
			<div className="space-y-1">
				<h1 className="font-extrabold text-[28px] text-ink tracking-tight">
					{title}
				</h1>
				<p className="text-ink-muted text-sm">{subtitle}</p>
			</div>
			{actions ? (
				<div className="flex flex-wrap items-center gap-2.5">{actions}</div>
			) : null}
		</header>
	);
}

function ViewSwitch({ view }: { view: ResaleView }) {
	const t = useTranslations("SellerResaleHub");
	return (
		<nav
			aria-label={t("viewSwitch")}
			className="inline-flex rounded-lg border border-line bg-surface p-1"
		>
			{(["reseller", "supplier"] as const).map((option) => (
				<Link
					key={option}
					href={resaleHref(option, option === "supplier" ? "orders" : "find")}
					aria-current={option === view ? "page" : undefined}
					className={cn(
						"inline-flex h-8 items-center rounded-md px-3 font-semibold text-sm",
						option === view
							? "bg-night text-white"
							: "text-ink-mid hover:text-ink",
					)}
				>
					{t(option === "supplier" ? "viewSupplier" : "viewReseller")}
				</Link>
			))}
		</nav>
	);
}

function Tabs({
	label,
	items,
	view,
	active,
}: {
	label: string;
	items: Array<{ tab: ResaleTab; label: string; count: number | null }>;
	view: ResaleView;
	active: ResaleTab;
}) {
	return (
		<nav
			aria-label={label}
			className="-mx-4 flex gap-7 overflow-x-auto border-line border-b px-4 sm:mx-0 sm:px-0"
		>
			{items.map((item) => {
				const current = item.tab === active;
				return (
					<Link
						key={item.tab}
						href={resaleHref(view, item.tab)}
						aria-current={current ? "page" : undefined}
						className={cn(
							"-mb-px flex shrink-0 items-center gap-1.5 border-b-2 py-2.5 font-semibold text-[15px]",
							current
								? "border-[var(--shop-accent,var(--c-brand))] text-[var(--shop-accent-text,var(--c-brand))]"
								: "border-transparent text-ink-muted hover:text-ink",
						)}
					>
						{item.label}
						{item.count !== null ? (
							<span
								className={cn(
									"rounded-full px-1.5 py-px text-xs",
									current
										? "bg-[var(--shop-accent-soft,var(--c-brand-tint))] text-[var(--shop-accent-text,var(--c-brand))]"
										: "bg-subtle text-ink-muted",
								)}
							>
								{item.count}
							</span>
						) : null}
					</Link>
				);
			})}
		</nav>
	);
}
