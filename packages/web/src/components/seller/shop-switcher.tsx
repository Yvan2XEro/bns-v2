"use client";

import { useQueryClient } from "@tanstack/react-query";
import { Check, ChevronsUpDown } from "lucide-react";
import { usePathname, useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "~/components/ui/dropdown-menu";
import { useMyShops } from "~/hooks/use-my-shops";
import { ACTIVE_SHOP_COOKIE, switchShopTarget } from "~/lib/active-shop";

const ONE_YEAR_SECONDS = 60 * 60 * 24 * 365;

function setActiveShopCookie(shopId: string) {
	document.cookie = `${ACTIVE_SHOP_COOKIE}=${encodeURIComponent(shopId)}; path=/; max-age=${ONE_YEAR_SECONDS}; SameSite=Lax`;
}

/**
 * The sidebar's dark header, which opens the shop list when the user belongs
 * to more than one shop. The cookie drives the whole seller space: the layout
 * and `useMyShop` both ask `GET /api/shops/mine` for it, and the server only
 * honours it among the caller's own memberships.
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
	const pathname = usePathname();
	const queryClient = useQueryClient();
	const { data: shops } = useMyShops();

	const header =
		"flex w-full items-center gap-2.5 border-[#1E293B] border-b p-4 text-left";

	if (!shops || shops.length < 2) {
		return <div className={header}>{children}</div>;
	}

	function select(shopId: string) {
		if (shopId === activeShopId) return;
		setActiveShopCookie(shopId);
		void queryClient.invalidateQueries();
		const target = switchShopTarget(pathname);
		if (target !== pathname) router.push(target);
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
					className="h-4 w-4 shrink-0 text-ink-faint"
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
