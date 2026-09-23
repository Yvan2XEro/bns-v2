import { AlertTriangle, FileText, Package, Plus } from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { FirstRunChecklist } from "~/components/seller/first-run-checklist";
import { PublicLinkCard } from "~/components/seller/public-link-card";
import { ShareShopButton } from "~/components/shop/share-shop-button";
import { getMyShop } from "~/lib/server-shop";

export default async function SellerDashboardPage() {
	const [mine, t] = await Promise.all([getMyShop(), getTranslations("Seller")]);
	const shop = mine?.shop;
	if (!shop) redirect("/shop/new");
	const counts = mine?.counts ?? {
		activeProducts: 0,
		draftProducts: 0,
		lowStockVariants: 0,
		lowStockSample: null,
		personalListings: 0,
	};

	const tiles = [
		{
			icon: Package,
			label: t("tiles.active"),
			value: counts.activeProducts,
			hint: null,
			href: "/seller/catalogue?status=active",
		},
		{
			icon: FileText,
			label: t("tiles.drafts"),
			value: counts.draftProducts,
			hint: null,
			href: "/seller/catalogue?status=draft",
		},
		{
			icon: AlertTriangle,
			label: t("tiles.lowStock"),
			value: counts.lowStockVariants,
			hint: counts.lowStockSample,
			href: "/seller/catalogue?stock=low",
		},
	];

	return (
		<div className="space-y-6">
			<div className="flex flex-wrap items-center justify-between gap-3">
				<div>
					<h1 className="font-bold text-2xl text-[#0F172A]">
						{t("dashboard")}
					</h1>
					<p className="text-[#64748B] text-sm">{shop.name}</p>
				</div>
				<div className="flex gap-2">
					<ShareShopButton
						handle={shop.handle}
						name={shop.name}
						label={t("shareShop")}
					/>
					<Link
						href="/seller/catalogue/new"
						className="inline-flex h-10 items-center gap-2 rounded-lg bg-[#1E40AF] px-4 font-semibold text-sm text-white hover:bg-[#1E3A8A]"
					>
						<Plus aria-hidden="true" className="h-4 w-4" />
						{t("addProduct")}
					</Link>
				</div>
			</div>

			<FirstRunChecklist
				hasLogo={Boolean(shop.logo)}
				productCount={counts.activeProducts + counts.draftProducts}
				personalListings={counts.personalListings}
				handle={shop.handle}
			/>

			<div className="grid gap-4 sm:grid-cols-3">
				{tiles.map(({ icon: Icon, label, value, hint, href }) => (
					<Link
						key={label}
						href={href}
						className="rounded-xl border border-[#E2E8F0] bg-white p-5 hover:border-[#93C5FD]"
					>
						<Icon aria-hidden="true" className="h-5 w-5 text-[#1E40AF]" />
						<p className="mt-3 font-bold text-2xl text-[#0F172A]">{value}</p>
						<p className="text-[#64748B] text-sm">{label}</p>
						{hint && (
							<p className="mt-1 truncate text-[#92400e] text-xs">{hint}</p>
						)}
					</Link>
				))}
			</div>

			<PublicLinkCard handle={shop.handle} name={shop.name} />
		</div>
	);
}
