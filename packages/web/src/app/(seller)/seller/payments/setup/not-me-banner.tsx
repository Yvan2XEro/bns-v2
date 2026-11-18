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
			<output className="block rounded-2xl border border-ok-line bg-ok-faint p-4 text-ok-ink text-sm">
				{t("setup_notMeConfirmed")}
			</output>
		);
	}

	return (
		<div
			role="alert"
			className="space-y-2 rounded-2xl border border-bad-line bg-bad-faint p-4 text-sm"
		>
			<p className="text-bad-deep">{t("setup_notMe")}</p>
			{reportNotMe.isError && (
				<p className="text-bad-ink-soft text-xs">
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
				className="h-10 rounded-lg bg-bad-ink-soft px-4 font-semibold text-sm text-white hover:bg-bad-ink disabled:opacity-50"
			>
				{t("setup_notMe")}
			</button>
		</div>
	);
}
