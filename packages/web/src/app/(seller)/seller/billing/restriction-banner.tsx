"use client";

import { ShieldAlert } from "lucide-react";
import { useTranslations } from "next-intl";
import { formatOrderDate } from "~/lib/order-money";
import { useLocaleKey } from "~/lib/use-locale-key";
import type { BillingView } from "~/types/order";

/** Says what is blocked, what is not, and what lifts it — never just "restricted". */
export function RestrictionBanner({
	restricted,
}: {
	restricted: NonNullable<BillingView["restricted"]>;
}) {
	const t = useTranslations("Billing");
	const locale = useLocaleKey();

	return (
		<section
			role="alert"
			aria-labelledby="restriction-title"
			className="flex gap-3 rounded-2xl border border-bad-line bg-bad-faint p-4 text-sm"
		>
			<ShieldAlert
				aria-hidden="true"
				className="mt-0.5 h-5 w-5 shrink-0 text-bad-ink-soft"
			/>
			<div className="space-y-1.5">
				<h2 id="restriction-title" className="font-semibold text-bad-deep">
					{t("restrictedTitle")}
					<span className="ml-2 font-normal text-bad-ink text-xs">
						{t("restrictedSince", {
							date: formatOrderDate(restricted.since, locale),
						})}
					</span>
				</h2>
				<p className="text-bad-deep">{t("restrictedBlocked")}</p>
				<p className="text-ink-soft">{t("restrictedAllowed")}</p>
				<p className="font-medium text-bad-deep">
					{restricted.reason === "staff"
						? t("restrictedClearStaff")
						: t("restrictedClearOverdue")}
				</p>
			</div>
		</section>
	);
}
