"use client";

import { Scale } from "lucide-react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { useAppConfig } from "~/hooks/use-app-config";

export function DisputesEntry() {
	const t = useTranslations("Disputes");
	const { ordersEnabled } = useAppConfig();
	if (!ordersEnabled) return null;
	return (
		<Link
			href="/account/disputes"
			className="flex items-center gap-3 rounded-xl border border-[#E2E8F0] bg-white p-4 transition-colors hover:border-[#C4B5FD] hover:bg-[#FAF9FF]"
		>
			<div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-[#F5F3FF]">
				<Scale aria-hidden="true" className="h-5 w-5 text-[#6D28D9]" />
			</div>
			<div>
				<p className="font-medium text-[#0F172A] text-sm">{t("title")}</p>
				<p className="text-[#64748B] text-xs">{t("subtitle")}</p>
			</div>
		</Link>
	);
}
