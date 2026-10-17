"use client";

import { RefreshCw } from "lucide-react";
import Link from "next/link";
import { useTranslations } from "next-intl";

export default function SellerError({ reset }: { reset: () => void }) {
	const t = useTranslations();
	return (
		<div className="flex flex-col items-center py-16 text-center">
			<h1 className="font-bold text-ink text-xl">{t("Error.title")}</h1>
			<div className="mt-6 flex flex-wrap justify-center gap-3">
				<button
					type="button"
					onClick={reset}
					className="inline-flex items-center gap-2 rounded-xl bg-[var(--shop-accent,var(--c-brand-fill))] px-5 py-2.5 font-medium text-[var(--shop-on-accent,#FFFFFF)] text-sm transition-colors hover:bg-[var(--shop-accent-hover,var(--c-brand-strong))]"
				>
					<RefreshCw className="h-4 w-4" />
					{t("Seller.errorRetry")}
				</button>
				<Link
					href="/seller"
					className="inline-flex items-center rounded-xl border border-line bg-surface px-5 py-2.5 font-medium text-ink text-sm hover:bg-canvas"
				>
					{t("Seller.errorBackToDashboard")}
				</Link>
			</div>
		</div>
	);
}
