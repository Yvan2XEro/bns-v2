"use client";

import { useTranslations } from "next-intl";
import type { RiderScreen } from "~/lib/rider-page";

/** One generic screen: it never says whether a link was revoked, expired, finished or never existed. */
export function RiderProblem({
	screen,
	onRetry,
}: {
	screen: RiderScreen;
	onRetry: () => void;
}) {
	const t = useTranslations("Rider");
	return (
		<div role="alert" className="space-y-3 py-16 text-center">
			<h1 className="font-bold text-[#0F172A] text-xl">
				{t(`${screen}Title`)}
			</h1>
			<p className="text-[#475569] text-sm">{t(`${screen}Body`)}</p>
			{screen !== "invalid" && (
				<button
					type="button"
					onClick={onRetry}
					className="min-h-12 rounded-xl bg-[#1E40AF] px-6 font-semibold text-white"
				>
					{t("retry")}
				</button>
			)}
		</div>
	);
}
