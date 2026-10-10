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
			className="flex items-center gap-3 rounded-xl border border-[#E2E8F0] bg-white p-4 transition-colors hover:border-[#93C5FD] hover:bg-[#F8FAFC]"
		>
			<div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-[#EFF6FF]">
				<RotateCcw aria-hidden="true" className="h-5 w-5 text-[#1E40AF]" />
			</div>
			<div>
				<p className="font-medium text-[#0F172A] text-sm">{t("title")}</p>
				<p className="text-[#64748B] text-xs">{t("subtitle")}</p>
			</div>
		</Link>
	);
}
