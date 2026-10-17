"use client";

import { AlertTriangle, RefreshCw } from "lucide-react";
import Link from "next/link";
import { useTranslations } from "next-intl";

export default function CheckoutError({
	error: err,
	reset,
}: {
	error: globalThis.Error & { digest?: string };
	reset: () => void;
}) {
	const t = useTranslations("Checkout.shell");
	return (
		<div className="flex min-h-[50vh] flex-col items-center justify-center px-4 py-16 text-center">
			<div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-warn-soft">
				<AlertTriangle aria-hidden="true" className="h-8 w-8 text-[#F59E0B]" />
			</div>
			<h1 className="font-bold text-2xl text-ink">{t("errorTitle")}</h1>
			<p className="mt-2 max-w-md text-ink-muted">{t("errorBody")}</p>
			{err.digest && (
				<p className="mt-2 font-mono text-ink-faint text-xs">{err.digest}</p>
			)}
			<div className="mt-8 flex items-center gap-4">
				<button
					type="button"
					onClick={reset}
					className="inline-flex items-center gap-2 rounded-xl bg-brand-fill px-5 py-2.5 font-medium text-sm text-white transition-colors hover:bg-brand-strong"
				>
					<RefreshCw aria-hidden="true" className="h-4 w-4" />
					{t("retry")}
				</button>
				<Link
					href="/cart"
					className="rounded-xl border border-line bg-surface px-5 py-2.5 font-medium text-ink text-sm hover:bg-canvas"
				>
					{t("backToCart")}
				</Link>
			</div>
		</div>
	);
}
