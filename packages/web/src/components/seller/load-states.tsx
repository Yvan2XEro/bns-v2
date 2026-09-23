"use client";

import { WifiOff } from "lucide-react";
import { useTranslations } from "next-intl";

export function LoadingRows({ rows = 5 }: { rows?: number }) {
	const t = useTranslations("Catalogue");
	return (
		<output aria-label={t("loading")} className="block space-y-2">
			{Array.from({ length: rows }, (_, index) => (
				<span
					key={`skeleton-${index}`}
					className="block h-14 animate-pulse rounded-lg bg-[#F1F5F9]"
				/>
			))}
		</output>
	);
}

export function LoadError({
	title,
	onRetry,
}: {
	title: string;
	onRetry: () => void;
}) {
	const t = useTranslations("Catalogue");
	return (
		<div
			role="alert"
			className="flex flex-col items-center rounded-xl border border-[#E2E8F0] bg-white px-6 py-12 text-center"
		>
			<WifiOff aria-hidden="true" className="h-8 w-8 text-[#94A3B8]" />
			<p className="mt-3 font-semibold text-[#0F172A]">{title}</p>
			<p className="mt-1 max-w-sm text-[#64748B] text-sm">{t("errorBody")}</p>
			<button
				type="button"
				onClick={onRetry}
				className="mt-4 h-10 rounded-lg bg-[#1E40AF] px-4 font-semibold text-sm text-white hover:bg-[#1E3A8A]"
			>
				{t("retry")}
			</button>
		</div>
	);
}
