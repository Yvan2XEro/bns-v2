"use client";

import { useTranslations } from "next-intl";
import { ShopInitials } from "~/components/shop/shop-initials";

/** What the shop header will look like, updated as the name is typed. */
export function ShopPreviewCard({ name }: { name: string }) {
	const t = useTranslations("ShopCreate");

	return (
		<div className="flex items-center gap-4 rounded-xl border border-[#E2E8F0] bg-white p-4">
			<ShopInitials name={name || "?"} className="h-14 w-14 text-lg" />
			<div className="min-w-0">
				<p className="truncate font-bold text-[#0F172A] text-lg">
					{name || t("namePlaceholder")}
				</p>
				<p className="text-[#64748B] text-sm">{t("previewLabel")}</p>
			</div>
		</div>
	);
}
