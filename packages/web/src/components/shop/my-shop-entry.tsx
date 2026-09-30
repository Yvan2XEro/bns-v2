import { ChevronRight, Store } from "lucide-react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { shopEntryFor } from "~/lib/shop-entry";
import type { MyShopResponse } from "~/types";
import { LevelBadge } from "./level-badge";

export function MyShopEntry({
	mine,
	shopsEnabled,
}: {
	mine: MyShopResponse | null;
	shopsEnabled: boolean;
}) {
	const t = useTranslations("Seller");
	const entry = shopEntryFor(mine, shopsEnabled);
	if (!entry) return null;
	const shop = entry.href === "/seller" ? mine?.shop : null;

	return (
		<Link
			href={entry.href}
			className="flex items-center gap-3 rounded-xl border border-[#E2E8F0] bg-white p-4 transition-colors hover:border-[#93C5FD] hover:bg-[#F8FAFC]"
		>
			<div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-[#FEF3C7]">
				<Store aria-hidden="true" className="h-5 w-5 text-[#D97706]" />
			</div>
			<div className="min-w-0 flex-1">
				<p className="font-medium text-[#0F172A] text-sm">{t(entry.key)}</p>
				{shop ? (
					<div className="mt-0.5 flex items-center gap-2">
						<span className="truncate text-[#64748B] text-xs">{shop.name}</span>
						<LevelBadge badge={shop.badge} size="sm" />
					</div>
				) : (
					<p className="text-[#64748B] text-xs">{t("openShopHint")}</p>
				)}
			</div>
			<ChevronRight aria-hidden="true" className="h-4 w-4 text-[#94A3B8]" />
		</Link>
	);
}
