"use client";

import { RotateCcw } from "lucide-react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { useAppConfig } from "~/hooks/use-app-config";

export function ReturnsEntry() {
	const t = useTranslations("Returns");
	const { ordersEnabled } = useAppConfig();
	if (!ordersEnabled) return null;

	return (
		<Link
			href="/account/returns"
			className="flex items-center gap-3 rounded-xl border border-line bg-surface p-4 transition-colors hover:border-brand-line hover:bg-canvas"
		>
			<div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-brand-soft">
				<RotateCcw aria-hidden="true" className="h-5 w-5 text-brand" />
			</div>
			<div>
				<p className="font-medium text-ink text-sm">{t("title")}</p>
				<p className="text-ink-muted text-xs">{t("subtitle")}</p>
			</div>
		</Link>
	);
}
