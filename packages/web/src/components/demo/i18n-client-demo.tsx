"use client";

import { useTranslations } from "next-intl";

export function I18nClientDemo() {
	const t = useTranslations("Demo");

	return (
		<div className="rounded-xl border border-[#3B82F6]/40 bg-[#EFF6FF] p-6">
			<span className="mb-3 inline-block rounded-full bg-[#3B82F6] px-3 py-1 font-medium text-white text-xs">
				Client Component
			</span>
			<h2 className="mb-2 font-semibold text-[#1E40AF] text-xl">
				{t("clientTitle")}
			</h2>
			<p className="text-[#374151]">{t("clientDescription")}</p>
		</div>
	);
}
