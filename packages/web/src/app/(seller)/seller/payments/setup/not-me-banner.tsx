"use client";

import { useTranslations } from "next-intl";
import { useState } from "react";
import { useReportPayoutAccountNotMe } from "~/hooks/use-seller-payments";
import { resolveErrorMessage } from "~/lib/apiError";

/**
 * The SMS "this was not me" link's target: `?shop=&notMe=<accountId>` in the
 * URL. The POST only ever fires from this explicit confirm button's
 * `onClick` — never from an effect or on mount — because an SMS link preview
 * (most carriers and messaging apps fetch a link to generate one) would
 * otherwise report every legitimate change as fraud the moment the text
 * arrives, before the owner has even opened it.
 */
export function NotMeBanner({
	shopId,
	accountId,
}: {
	shopId: string;
	accountId: string;
}) {
	const t = useTranslations("Payments");
	const tRoot = useTranslations();
	const reportNotMe = useReportPayoutAccountNotMe(shopId);
	const [confirmed, setConfirmed] = useState(false);

	if (confirmed || reportNotMe.isSuccess) {
		return (
			<output className="block rounded-2xl border border-[#BBF7D0] bg-[#F0FDF4] p-4 text-[#166534] text-sm">
				{t("setup_notMeConfirmed")}
			</output>
		);
	}

	return (
		<div
			role="alert"
			className="space-y-2 rounded-2xl border border-[#FECACA] bg-[#FEF2F2] p-4 text-sm"
		>
			<p className="text-[#7F1D1D]">{t("setup_notMe")}</p>
			{reportNotMe.isError && (
				<p className="text-[#B91C1C] text-xs">
					{resolveErrorMessage(reportNotMe.error, tRoot)}
				</p>
			)}
			<button
				type="button"
				disabled={reportNotMe.isPending}
				onClick={() => {
					reportNotMe.mutate(accountId, {
						onSuccess: () => setConfirmed(true),
					});
				}}
				className="h-10 rounded-lg bg-[#B91C1C] px-4 font-semibold text-sm text-white hover:bg-[#991B1B] disabled:opacity-50"
			>
				{t("setup_notMe")}
			</button>
		</div>
	);
}
