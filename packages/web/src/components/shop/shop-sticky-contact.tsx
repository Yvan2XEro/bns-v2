"use client";

import { usePathname } from "next/navigation";
import { useScrolledPast } from "~/hooks/use-scrolled-past";
import { showTabBar } from "~/lib/nav";
import { shopTheme } from "~/lib/shop-theme";
import { cn } from "~/lib/utils";
import type { PublicShop } from "~/types";
import { ShopContactButtons } from "./shop-contact-buttons";

/**
 * Below `md`, the same « Contacter » menu pinned to the bottom once the
 * hero's contact buttons (`[data-shop-contact]`) have scrolled up under the
 * header; it sits above the tab bar where that bar shows.
 */
export function ShopStickyContact({
	shop,
}: {
	shop: Pick<PublicShop, "id" | "contact" | "brandColor">;
}) {
	const pathname = usePathname();
	const visible = useScrolledPast("[data-shop-contact]", true);
	const aboveTabBar = showTabBar(pathname);

	return (
		<>
			<div
				inert={!visible}
				aria-hidden={!visible}
				className={cn(
					"fixed inset-x-0 z-30 border-[#E2E8F0] border-t bg-white/95 px-4 pt-2 shadow-[0_-4px_12px_rgba(15,23,42,0.08)] backdrop-blur transition-[transform,opacity] duration-200 md:hidden",
					aboveTabBar
						? "bottom-[calc(4rem+env(safe-area-inset-bottom))] pb-2"
						: "bottom-0 pb-[calc(0.5rem+env(safe-area-inset-bottom))]",
					visible
						? "translate-y-0 opacity-100"
						: "pointer-events-none translate-y-full opacity-0",
				)}
			>
				<ShopContactButtons
					shopId={shop.id}
					contact={shop.contact}
					theme={shopTheme(shop.brandColor)}
					variant="bar"
				/>
			</div>
			{/* Keeps the end of the page clear of the bar. */}
			<div aria-hidden="true" className="h-16 md:hidden" />
		</>
	);
}
