"use client";

import { AlertTriangle, Home, RefreshCw } from "lucide-react";
import Link from "next/link";
import { useTranslations } from "next-intl";

/** The route-level error screen, shared by the root and public segments. */
export function ErrorView({
	error,
	reset,
}: {
	error: globalThis.Error & { digest?: string };
	reset: () => void;
}) {
	const t = useTranslations("Error");
	return (
		<div className="flex min-h-[60vh] flex-col items-center justify-center px-4 py-16">
			<div className="text-center">
				<div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-[#FEF3C7]">
					<AlertTriangle className="h-8 w-8 text-[#F59E0B]" />
				</div>
				<h1 className="font-bold text-2xl text-[#0F172A]">{t("title")}</h1>
				<p className="mt-2 max-w-md text-[#64748B]">{t("descriptionHome")}</p>
				{error.digest && (
					<p className="mt-2 font-mono text-[#94A3B8] text-xs">
						{t("errorId", { digest: error.digest })}
					</p>
				)}
				<div className="mt-8 flex items-center justify-center gap-4">
					<button
						type="button"
						onClick={reset}
						className="inline-flex items-center gap-2 rounded-xl bg-[#1E40AF] px-5 py-2.5 font-medium text-sm text-white transition-colors hover:bg-[#1E3A8A]"
					>
						<RefreshCw className="h-4 w-4" />
						{t("tryAgain")}
					</button>
					<Link
						href="/"
						className="inline-flex items-center gap-2 rounded-xl border border-[#E2E8F0] bg-white px-5 py-2.5 font-medium text-[#0F172A] text-sm transition-colors hover:bg-[#F8FAFC]"
					>
						<Home className="h-4 w-4" />
						{t("backHome")}
					</Link>
				</div>
			</div>
		</div>
	);
}
