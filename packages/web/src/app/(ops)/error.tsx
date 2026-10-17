"use client";

import { RefreshCw } from "lucide-react";
import { useTranslations } from "next-intl";
import { useReportError } from "~/hooks/use-report-error";

export default function ErrorPage({
	error,
	reset,
}: {
	error: globalThis.Error & { digest?: string };
	reset: () => void;
}) {
	useReportError(error);
	const t = useTranslations("Moderation.shell");
	return (
		<div className="flex flex-col items-center py-16 text-center">
			<h1 className="font-bold text-ink text-xl">{t("errorTitle")}</h1>
			<p className="mt-2 text-ink-muted text-sm">{t("errorBody")}</p>
			<button
				type="button"
				onClick={reset}
				className="mt-6 inline-flex items-center gap-2 rounded-xl bg-brand-fill px-5 py-2.5 font-medium text-sm text-white transition-colors hover:bg-brand-strong"
			>
				<RefreshCw className="h-4 w-4" />
				{t("retry")}
			</button>
		</div>
	);
}
