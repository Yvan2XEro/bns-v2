"use client";

import { ShoppingBag } from "lucide-react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { useAppConfig } from "~/hooks/use-app-config";

/** "Mes achats" — an order entry point, so it follows `ordersEnabled` like the others. */
export function PurchasesEntry() {
	const t = useTranslations("Profile");
	const { ordersEnabled } = useAppConfig();
	if (!ordersEnabled) return null;

	return (
		<Link
			href="/purchases"
			className="flex items-center gap-3 rounded-xl border border-line bg-surface p-4 transition-colors hover:border-brand-line hover:bg-canvas"
		>
			<div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-brand-soft">
				<ShoppingBag aria-hidden="true" className="h-5 w-5 text-brand" />
			</div>
			<div>
				<p className="font-medium text-ink text-sm">{t("purchases")}</p>
				<p className="text-ink-muted text-xs">{t("purchasesHint")}</p>
			</div>
		</Link>
	);
}
