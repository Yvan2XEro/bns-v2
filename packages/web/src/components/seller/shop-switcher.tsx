"use client";

import { Check, ChevronsUpDown } from "lucide-react";
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

const ONE_YEAR_SECONDS = 60 * 60 * 24 * 365;

function setActiveShopCookie(shopId: string) {
	document.cookie = `${ACTIVE_SHOP_COOKIE}=${encodeURIComponent(shopId)}; path=/; max-age=${ONE_YEAR_SECONDS}; SameSite=Lax`;
}

/**
 * The sidebar's dark header, which opens the shop list when the user belongs
 * to more than one shop. Only the inbox reads `ACTIVE_SHOP_COOKIE` today (the
 * rest of the seller space is still keyed off `GET /api/shops/mine`'s single
 * shop), so picking a shop here changes which shop's conversations
 * `/seller/messages` shows — `activeShopId` is the shop that screen is
 * currently resolving to.
 */
export function ShopSwitcher({
	activeShopId,
	children,
}: {
	activeShopId: string;
	/** The header's own content: logo, name and subtitle. */
	children: React.ReactNode;
}) {
	const t = useTranslations("Inbox");
	const router = useRouter();
	const { data: shops } = useMyShops();

	const header =
		"flex w-full items-center gap-2.5 border-[#1E293B] border-b p-4 text-left";

	if (!shops || shops.length < 2) {
		return <div className={header}>{children}</div>;
	}

	function select(shopId: string) {
		if (shopId === activeShopId) return;
		setActiveShopCookie(shopId);
		router.refresh();
	}

	return (
		<DropdownMenu>
			<DropdownMenuTrigger
				className={`${header} hover:bg-white/5`}
				aria-label={t("switchShop")}
			>
				{children}
				<ChevronsUpDown
					aria-hidden="true"
					className="h-4 w-4 shrink-0 text-[#94A3B8]"
				/>
			</DropdownMenuTrigger>
			<DropdownMenuContent align="start" className="w-56">
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
