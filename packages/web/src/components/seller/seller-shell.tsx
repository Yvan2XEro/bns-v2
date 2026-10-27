import { getLocale, getTranslations } from "next-intl/server";
import { Toaster } from "sonner";
import { LocaleSwitcher } from "~/components/layout/locale-switcher";
import { NotificationInbox } from "~/components/layout/notification-inbox";
import { novuInbox } from "~/lib/novu";
import { shopProfileRules } from "~/lib/shop-profile";
import { isBrandColor, shopTheme } from "~/lib/shop-theme";
import type { MyShopResponse } from "~/types";
import { SellerSidebar } from "./seller-sidebar";
import { SellerTheme } from "./seller-theme";
import { StockAdjust } from "./stock-adjust-drawer";
import { SuspensionBanner } from "./suspension-banner";

export async function SellerShell({
	mine,
	children,
}: {
	mine: MyShopResponse & { shop: NonNullable<MyShopResponse["shop"]> };
	children: React.ReactNode;
}) {
	const locale = await getLocale();
	const t = await getTranslations("Nav");
	const novu = novuInbox();
	const { shop, role, roleReason } = mine;
	// A shop without a colour keeps the platform's dashboard as it is.
	const theme = isBrandColor(shop.brandColor)
		? shopTheme(shop.brandColor)
		: null;

	return (
		<SellerTheme theme={theme}>
			<div className="min-h-screen bg-canvas lg:flex">
				<Toaster richColors position="top-center" />
				<StockAdjust shopId={shop.id} />
				<SellerSidebar
					shopId={shop.id}
					name={shop.name}
					handle={shop.handle}
					badge={shop.badge}
					logoUrl={shop.logo?.url ?? null}
					lowStock={mine.counts?.lowStockVariants ?? 0}
					role={role}
					roleReason={roleReason}
					retail={shopProfileRules(shop.profile).retail}
				/>
				<div className="min-w-0 flex-1">
					<div className="flex items-center justify-end gap-1 border-line border-b bg-surface px-2 lg:px-6">
						{novu && (
							<NotificationInbox
								novu={novu}
								label={t("alerts")}
								tone="text-ink-muted hover:bg-subtle hover:text-ink"
							/>
						)}
						<div className="lg:hidden">
							<LocaleSwitcher />
						</div>
					</div>
					<SuspensionBanner shop={shop} locale={locale} />
					<div className="px-4 py-6 sm:px-6 lg:px-8 lg:py-7">{children}</div>
				</div>
			</div>
		</SellerTheme>
	);
}
