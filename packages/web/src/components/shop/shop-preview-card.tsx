"use client";

import { useTranslations } from "next-intl";
import { ShopInitials } from "~/components/shop/shop-initials";

/** What the shop header will look like, updated as the name is typed. */
export function ShopPreviewCard({ name }: { name: string }) {
	const t = useTranslations("ShopCreate");

	return (
		<div className="flex items-center gap-4 rounded-xl border border-line bg-surface p-4">
			<ShopInitials name={name || "?"} className="h-14 w-14 text-lg" />
			<div className="min-w-0">
				<p className="truncate font-bold text-ink text-lg">
					{name || t("namePlaceholder")}
				</p>
				<p className="text-ink-muted text-sm">{t("previewLabel")}</p>
			</div>
		</div>
	);
}
