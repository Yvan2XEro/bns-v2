"use client";

import { useTranslations } from "next-intl";
import type { RelativeAge } from "~/lib/moderation-verification";

/** How long ago a request was submitted. Renders nothing for a draft that was never submitted. */
export function AgeChip({ age }: { age: RelativeAge | null }) {
	const t = useTranslations("Moderation");
	if (!age) return null;

	const label =
		age.unit === "minutes"
			? t("age.minutes", { count: age.count })
			: age.unit === "hours"
				? t("age.hours", { count: age.count })
				: t("age.days", { count: age.count });

	return (
		<span className="inline-flex items-center whitespace-nowrap rounded-full bg-[#F1F5F9] px-2 py-0.5 font-medium text-[#334155] text-[11px]">
			{label}
		</span>
	);
}
