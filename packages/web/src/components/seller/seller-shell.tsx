import { getLocale } from "next-intl/server";
import { Toaster } from "sonner";
import { LocaleSwitcher } from "~/components/layout/locale-switcher";
import type { MyShopResponse } from "~/types";
import { SellerSidebar } from "./seller-sidebar";
import { SuspensionBanner } from "./suspension-banner";

export async function SellerShell({
	mine,
	children,
}: {
	mine: MyShopResponse & { shop: NonNullable<MyShopResponse["shop"]> };
	children: React.ReactNode;
}) {
	const locale = await getLocale();
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
				<div className="flex justify-end border-[#E2E8F0] border-b bg-white px-2 lg:hidden">
					<LocaleSwitcher />
				</div>
				<SuspensionBanner shop={shop} locale={locale} />
				<div className="px-4 py-6 sm:px-6 lg:px-8 lg:py-7">{children}</div>
			</div>
		</div>
	);
}
