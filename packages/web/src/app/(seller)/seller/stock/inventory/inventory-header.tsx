"use client";

import { LoaderCircle, Printer } from "lucide-react";
import Link from "next/link";
import { useTranslations } from "next-intl";

export function InventoryHeader({
	startedLabel,
	onSaveDraft,
	submitting,
	submitDisabled,
}: {
	startedLabel: string;
	onSaveDraft: () => void;
	submitting: boolean;
	submitDisabled: boolean;
}) {
	const t = useTranslations("Inventory");

	return (
		<div className="flex flex-wrap items-start justify-between gap-3">
			<div>
				<p className="text-[#64748B] text-sm">
					<Link href="/seller/stock" className="hover:text-[#1E40AF]">
						{t("breadcrumb")}
					</Link>{" "}
					› {t("title")}
				</p>
				<h1 className="font-bold text-2xl text-[#0F172A]">
					{t("heading", { date: startedLabel })}
				</h1>
				<p className="text-[#64748B] text-sm">{t("subtitle")}</p>
			</div>
			<div className="flex flex-wrap gap-2 print:hidden">
				<button
					type="button"
					onClick={() => window.print()}
					className="inline-flex h-10 items-center gap-2 rounded-lg border border-[#E2E8F0] bg-white px-4 text-sm"
				>
					<Printer aria-hidden="true" className="h-4 w-4" />
					{t("print")}
				</button>
				<button
					type="button"
					onClick={onSaveDraft}
					className="h-10 rounded-lg border border-[#E2E8F0] bg-white px-4 text-sm"
				>
					{t("resumeLater")}
				</button>
				<button
					type="submit"
					disabled={submitDisabled}
					className="inline-flex h-10 items-center gap-2 rounded-lg bg-[#1E40AF] px-4 font-semibold text-sm text-white disabled:opacity-50"
				>
					{submitting && (
						<LoaderCircle aria-hidden="true" className="h-4 w-4 animate-spin" />
					)}
					{t("submit")}
				</button>
			</div>
		</div>
	);
}
