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
					className="block h-14 animate-pulse rounded-lg bg-subtle"
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
			className="flex flex-col items-center rounded-xl border border-line bg-surface px-6 py-12 text-center"
		>
			<WifiOff aria-hidden="true" className="h-8 w-8 text-ink-faint" />
			<p className="mt-3 font-semibold text-ink">{title}</p>
			<p className="mt-1 max-w-sm text-ink-muted text-sm">{t("errorBody")}</p>
			<button
				type="button"
				onClick={onRetry}
				className="mt-4 h-10 rounded-lg bg-[var(--shop-accent,var(--c-brand))] px-4 font-semibold text-[var(--shop-on-accent,#FFFFFF)] text-sm hover:bg-[var(--shop-accent-hover,var(--c-brand-strong))]"
			>
				{t("retry")}
			</button>
		</div>
	);
}
