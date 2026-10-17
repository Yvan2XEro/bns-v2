"use client";

import { Eye, LoaderCircle } from "lucide-react";
import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import { StatusChip } from "~/components/shop/status-chip";
import { Button } from "~/components/ui/button";
import { useCatalogueStockT } from "~/hooks/use-catalogue-stock-t";
import type { ProductStatus } from "~/types";

function timeLabel(
	iso: string,
	locale: string,
): { today: boolean; date: string; time: string } {
	const date = new Date(iso);
	return {
		today: date.toDateString() === new Date().toDateString(),
		date: date.toLocaleDateString(locale, { day: "numeric", month: "short" }),
		time: date.toLocaleTimeString(locale, {
			hour: "2-digit",
			minute: "2-digit",
		}),
	};
}

/**
 * Breadcrumb, product name and the save actions. Creating offers the two
 * outcomes the status carries — a draft nobody sees, or a published listing —
 * while an existing product saves with the status its publication card holds.
 */
export function ProductEditorHeader({
	heading,
	isEdit,
	savedStatus,
	pending,
	onSubmitAs,
	updatedAt,
	previewHref,
	autosavedAt,
	onCancel,
}: {
	heading: string;
	isEdit: boolean;
	/** The status as last saved, not the publication card's pending choice. */
	savedStatus: ProductStatus | null;
	pending: boolean;
	onSubmitAs: (status: ProductStatus) => void;
	/** Editing: when the product was last saved. */
	updatedAt?: string | null;
	/** Editing: the public listing, only once it is online. */
	previewHref?: string | null;
	/** Creating: when the form was last kept on this device. */
	autosavedAt?: string | null;
	onCancel?: () => void;
}) {
	const t = useTranslations("ProductEditor");
	const te = useCatalogueStockT("editor");
	const locale = useLocale();
	const spinner = pending ? (
		<LoaderCircle aria-hidden="true" className="mr-2 h-4 w-4 animate-spin" />
	) : null;

	let subtitle: string | null = null;
	if (isEdit && updatedAt) {
		const when = timeLabel(updatedAt, locale);
		subtitle = when.today
			? te("updatedToday", { time: when.time })
			: te("updatedOn", { date: when.date, time: when.time });
	} else if (!isEdit && autosavedAt) {
		subtitle = te("autosaved", { time: timeLabel(autosavedAt, locale).time });
	}

	return (
		<div className="flex flex-wrap items-start justify-between gap-3">
			<div>
				{/* Editing, the workspace breadcrumb above already says this. */}
				{!isEdit && (
					<p className="text-ink-muted text-sm">
						<Link
							href="/seller/catalogue"
							className="hover:text-[var(--shop-accent-text,var(--c-brand))]"
						>
							{t("breadcrumb")}
						</Link>{" "}
						› {heading}
					</p>
				)}
				<div className="flex flex-wrap items-center gap-2.5">
					<h1 className="font-bold text-2xl text-ink">{heading}</h1>
					{isEdit && savedStatus && (
						<StatusChip kind={savedStatus} className="px-2.5 text-xs" />
					)}
				</div>
				{subtitle && (
					<p aria-live="polite" className="mt-0.5 text-ink-muted text-sm">
						{subtitle}
					</p>
				)}
			</div>
			<div className="flex flex-wrap gap-2">
				{isEdit ? (
					<>
						{previewHref ? (
							<Button asChild variant="outline">
								<a href={previewHref} target="_blank" rel="noreferrer">
									<Eye aria-hidden="true" className="mr-2 h-4 w-4" />
									{te("preview")}
								</a>
							</Button>
						) : (
							<Button
								type="button"
								variant="outline"
								disabled
								title={te("previewUnavailable")}
							>
								<Eye aria-hidden="true" className="mr-2 h-4 w-4" />
								{te("preview")}
							</Button>
						)}
						<Button
							type="submit"
							disabled={pending}
							className="bg-[var(--shop-accent,var(--c-brand-fill))] text-[var(--shop-on-accent,#FFFFFF)] hover:bg-[var(--shop-accent-hover,var(--c-brand-strong))]"
						>
							{spinner}
							{t("save")}
						</Button>
					</>
				) : (
					<>
						{onCancel && (
							<Button
								type="button"
								variant="ghost"
								onClick={onCancel}
								disabled={pending}
							>
								{te("cancel")}
							</Button>
						)}
						<Button
							type="button"
							variant="outline"
							onClick={() => onSubmitAs("draft")}
							disabled={pending}
						>
							{t("saveDraft")}
						</Button>
						<Button
							type="button"
							onClick={() => onSubmitAs("active")}
							disabled={pending}
							className="bg-[var(--shop-accent,var(--c-brand-fill))] text-[var(--shop-on-accent,#FFFFFF)] hover:bg-[var(--shop-accent-hover,var(--c-brand-strong))]"
						>
							{spinner}
							{t("publish")}
						</Button>
					</>
				)}
			</div>
		</div>
	);
}
