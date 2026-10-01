"use client";

import { Check, ChevronsUpDown, Store } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "~/components/ui/dropdown-menu";
import { useMyShops } from "~/hooks/use-my-shops";
import { ACTIVE_SHOP_COOKIE } from "~/lib/active-shop";
import { cn } from "~/lib/utils";

const ONE_YEAR_SECONDS = 60 * 60 * 24 * 365;

function setActiveShopCookie(shopId: string) {
	document.cookie = `${ACTIVE_SHOP_COOKIE}=${encodeURIComponent(shopId)}; path=/; max-age=${ONE_YEAR_SECONDS}; SameSite=Lax`;
}

/**
 * Only the inbox reads `ACTIVE_SHOP_COOKIE` today (the rest of the seller
 * space is still keyed off `GET /api/shops/mine`'s single shop), so picking a
 * shop here changes which shop's conversations `/seller/messages` shows —
 * `activeShopId` is the shop that screen is currently resolving to.
 */
export function ShopSwitcher({ activeShopId }: { activeShopId: string }) {
	const t = useTranslations("Inbox");
	const router = useRouter();
	const { data: shops } = useMyShops();

	if (!shops || shops.length < 2) return null;

	const active = shops.find((entry) => entry.shopId === activeShopId);

	function select(shopId: string) {
		if (shopId === activeShopId) return;
		setActiveShopCookie(shopId);
		router.refresh();
	}

	return (
		<DropdownMenu>
			<DropdownMenuTrigger
				className={cn(
					"flex items-center gap-2 rounded-lg border border-[#E2E8F0] bg-white px-3 py-2 font-medium text-[#334155] text-sm hover:bg-[#F8FAFC]",
				)}
				aria-label={t("switchShop")}
			>
				<Store aria-hidden="true" className="h-4 w-4 shrink-0" />
				<span className="max-w-40 truncate">
					{active?.name ?? t("switchShop")}
				</span>
				<ChevronsUpDown
					aria-hidden="true"
					className="h-4 w-4 shrink-0 opacity-50"
				/>
			</DropdownMenuTrigger>
			<DropdownMenuContent align="end">
				{shops.map((entry) => (
					<DropdownMenuItem
						key={entry.shopId}
						onClick={() => select(entry.shopId)}
						className="flex items-center justify-between gap-3"
					>
						<span className="truncate">{entry.name}</span>
						{entry.shopId === activeShopId && (
							<Check aria-hidden="true" className="h-4 w-4 shrink-0" />
						)}
					</DropdownMenuItem>
				))}
			</DropdownMenuContent>
		</DropdownMenu>
	);
}
