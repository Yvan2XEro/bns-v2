import Link from "next/link";
import { useTranslations } from "next-intl";
import { LevelBadge } from "~/components/shop/level-badge";
import { ShopInitials } from "~/components/shop/shop-initials";
import { shopLogoUrl } from "~/lib/listing-shop";
import { badgeForLevel } from "~/lib/verification";
import type { Shop } from "~/types";

export function ShopSellerCard({
	shop,
	ownerName,
}: {
	shop: Shop;
	ownerName: string | null;
}) {
	const t = useTranslations("Shop");

	return (
		<Link href={`/s/${shop.handle}`} className="flex items-center gap-3">
			<ShopInitials
				name={shop.name}
				logoUrl={shopLogoUrl(shop)}
				className="h-12 w-12 rounded-xl text-sm"
			/>
			<div className="min-w-0">
				<div className="flex flex-wrap items-center gap-2">
					<p className="truncate font-semibold text-[#0F172A]">{shop.name}</p>
					<LevelBadge badge={badgeForLevel(shop.level)} size="sm" />
				</div>
				{ownerName && (
					<p className="text-[#64748B] text-xs">
						{t("runBy", { name: ownerName })}
					</p>
				)}
				<p className="text-[#1E40AF] text-xs">{t("visitShop")}</p>
			</div>
		</Link>
	);
}
