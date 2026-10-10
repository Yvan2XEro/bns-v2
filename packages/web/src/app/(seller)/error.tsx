"use client";

import { RefreshCw } from "lucide-react";
import Link from "next/link";
import { useTranslations } from "next-intl";

export default function SellerError({ reset }: { reset: () => void }) {
	const t = useTranslations();
	return (
		<div className="flex flex-col items-center py-16 text-center">
			<h1 className="font-bold text-[#0F172A] text-xl">{t("Error.title")}</h1>
			<div className="mt-6 flex flex-wrap justify-center gap-3">
				<button
					type="button"
					onClick={reset}
					className="inline-flex items-center gap-2 rounded-xl bg-[#1E40AF] px-5 py-2.5 font-medium text-sm text-white transition-colors hover:bg-[#1E3A8A]"
				>
					<RefreshCw className="h-4 w-4" />
					{t("Seller.errorRetry")}
				</button>
				<Link
					href="/seller"
					className="inline-flex items-center rounded-xl border border-[#E2E8F0] bg-white px-5 py-2.5 font-medium text-[#0F172A] text-sm hover:bg-[#F8FAFC]"
				>
					{t("Seller.errorBackToDashboard")}
				</Link>
			</div>
		</div>
	);
}
