"use client";

import Image from "next/image";
import Link from "next/link";
import { LevelBadge } from "~/components/shop/level-badge";
import { useAppConfig } from "~/hooks/use-app-config";
import { shopTheme } from "~/lib/shop-theme";
import type { CartView } from "~/types/order";

type HeaderShop = NonNullable<CartView["shop"]>;

function initialsOf(name: string): string {
	return name
		.split(/\s+/)
		.filter(Boolean)
		.slice(0, 2)
		.map((word) => word[0]?.toUpperCase() ?? "")
		.join("");
}

/** Logo (or initials), name, verification badge and city, as the cart and checkout headers show a shop. */
export function CartShopHeader({
	shop,
	size = "md",
}: {
	shop: HeaderShop;
	size?: "sm" | "md";
}) {
	const { launchCities } = useAppConfig();
	const city =
		launchCities.find((c) => c.key === shop.city)?.label ?? shop.city ?? null;
	const box = size === "sm" ? "h-10 w-10" : "h-12 w-12";
	// The shop's colour marks only its identity here; the cart and checkout stay the platform's.
	const brand = shop.brandColor ? shopTheme(shop.brandColor).light : null;

	return (
		<div className="flex items-center gap-3">
			<div
				className={`relative flex ${box} shrink-0 items-center justify-center overflow-hidden rounded-xl bg-night font-extrabold text-[#F59E0B] text-sm`}
				style={
					brand
						? { backgroundColor: brand.headerBg, color: brand.headerFg }
						: undefined
				}
			>
				{shop.logoUrl ? (
					<Image
						src={shop.logoUrl}
						alt=""
						fill
						sizes="48px"
						className="object-cover"
					/>
				) : (
					<span aria-hidden>{initialsOf(shop.name)}</span>
				)}
			</div>
			<div className="min-w-0 space-y-1">
				<div className="flex flex-wrap items-center gap-2">
					<Link
						href={`/s/${shop.handle}`}
						className="font-bold text-ink hover:text-brand hover:underline"
					>
						{shop.name}
					</Link>
					<LevelBadge badge={shop.badge} size="sm" />
				</div>
				{city ? <p className="text-ink-muted text-sm">{city}</p> : null}
			</div>
		</div>
	);
}
