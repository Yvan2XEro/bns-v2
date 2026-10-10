import { getLocale, getTranslations } from "next-intl/server";
import { Toaster } from "sonner";
import type { MyShopResponse } from "~/types";
import { SellerSidebar } from "./seller-sidebar";
import { ShopSwitcher } from "./shop-switcher";
import { SuspensionBanner } from "./suspension-banner";

export async function SellerShell({
	mine,
	children,
}: {
	mine: MyShopResponse & { shop: NonNullable<MyShopResponse["shop"]> };
	children: React.ReactNode;
}) {
	const [locale, t] = await Promise.all([
		getLocale(),
		getTranslations("Seller"),
	]);
	const { shop, role, roleReason } = mine;

	return (
		<div className="min-h-screen bg-[#F8FAFC] lg:flex">
			<Toaster richColors position="top-center" />
			<SellerSidebar
				shopId={shop.id}
				name={shop.name}
				handle={shop.handle}
				badge={shop.badge}
				logoUrl={shop.logo?.url ?? null}
				lowStock={mine.counts?.lowStockVariants ?? 0}
				role={role}
				roleReason={roleReason}
			/>
			<div className="min-w-0 flex-1">
				<div className="flex items-center justify-between border-[#E2E8F0] border-b bg-white px-4 py-2.5 sm:px-6">
					<p className="truncate text-[#64748B] text-sm">
						<span className="font-semibold text-[#0F172A]">{shop.name}</span>
						{" · "}
						{t("space")}
					</p>
					<ShopSwitcher activeShopId={shop.id} />
				</div>
				<SuspensionBanner shop={shop} locale={locale} />
				<div className="mx-auto max-w-6xl px-4 py-6 sm:px-6 lg:px-8">
					{children}
				</div>
			</div>
		</div>
	);
}
