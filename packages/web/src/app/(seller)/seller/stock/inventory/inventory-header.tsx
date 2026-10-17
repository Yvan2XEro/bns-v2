"use client";

import { LoaderCircle, Printer } from "lucide-react";
import Link from "next/link";
import { useTranslations } from "next-intl";

export function InventoryHeader({
	startedLabel,
	onSaveDraft,
	savingDraft,
	submitting,
	submitDisabled,
}: {
	startedLabel: string;
	savingDraft: boolean;
	onSaveDraft: () => void;
	submitting: boolean;
	submitDisabled: boolean;
}) {
	const t = useTranslations("Inventory");

	return (
		<div className="flex flex-wrap items-start justify-between gap-3">
			<div>
				<p className="text-ink-muted text-sm">
					<Link
						href="/seller/stock"
						className="hover:text-[var(--shop-accent-text,var(--c-brand))]"
					>
						{t("breadcrumb")}
					</Link>{" "}
					› {t("title")}
				</p>
				<h1 className="font-bold text-2xl text-ink">
					{t("heading", { date: startedLabel })}
				</h1>
				<p className="text-ink-muted text-sm">{t("subtitle")}</p>
			</div>
			<div className="flex flex-wrap gap-2 print:hidden">
				<button
					type="button"
					onClick={() => window.print()}
					className="inline-flex h-10 items-center gap-2 rounded-lg border border-line bg-surface px-4 text-sm"
				>
					<Printer aria-hidden="true" className="h-4 w-4" />
					{t("print")}
				</button>
				<button
					type="button"
					onClick={onSaveDraft}
					disabled={savingDraft}
					className="h-10 rounded-lg border border-line bg-surface px-4 text-sm disabled:opacity-50"
				>
					{t("resumeLater")}
				</button>
				<button
					type="submit"
					disabled={submitDisabled}
					className="inline-flex h-10 items-center gap-2 rounded-lg bg-[var(--shop-accent,var(--c-brand-fill))] px-4 font-semibold text-[var(--shop-on-accent,#FFFFFF)] text-sm disabled:opacity-50"
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
