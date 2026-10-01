import { getLocale } from "next-intl/server";
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
	const locale = await getLocale();
	const { shop, role } = mine;

	return (
		<div className="min-h-[calc(100vh-3.5rem)] bg-[#F8FAFC] lg:flex">
			<Toaster richColors position="top-center" />
			<SellerSidebar
				shopId={shop.id}
				name={shop.name}
				handle={shop.handle}
				badge={shop.badge}
				logoUrl={shop.logo?.url ?? null}
				lowStock={mine.counts?.lowStockVariants ?? 0}
				role={role}
			/>
			<div className="min-w-0 flex-1">
				<SuspensionBanner shop={shop} locale={locale} />
				<div className="mx-auto max-w-6xl px-4 py-6 sm:px-6 lg:px-8">
					<div className="mb-4 flex justify-end">
						<ShopSwitcher activeShopId={shop.id} />
					</div>
					{children}
				</div>
			</div>
		</div>
	);
}
