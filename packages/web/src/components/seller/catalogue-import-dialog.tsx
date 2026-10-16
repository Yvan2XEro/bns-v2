"use client";

import { Download, LoaderCircle, Upload } from "lucide-react";
import { useTranslations } from "next-intl";
import { useId, useState } from "react";
import { Button } from "~/components/ui/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogTitle,
} from "~/components/ui/dialog";
import {
	type ImportOutcome,
	useImportProducts,
} from "~/hooks/use-catalogue-actions";
import { resolveErrorMessage } from "~/lib/apiError";
import {
	IMPORT_MAX_ROWS,
	IMPORT_TEMPLATE,
	type ImportParse,
	parseProductImport,
} from "~/lib/product-import";
import { cn } from "~/lib/utils";
import type { Category } from "~/types";

const TEMPLATE_HREF = `data:text/csv;charset=utf-8,${encodeURIComponent(`﻿${IMPORT_TEMPLATE}`)}`;

/**
 * Choose a file → check every line → create the valid ones as drafts. Drafts
 * on purpose: an import never puts anything on sale before the seller has
 * looked at it in the editor (photos, attributes).
 */
export function CatalogueImportDialog({
	shopId,
	categories,
	otherCategoryNames,
	includeCost,
	open,
	onOpenChange,
}: {
	shopId: string;
	categories: Category[];
	otherCategoryNames?: Record<string, string>;
	includeCost: boolean;
	open: boolean;
	onOpenChange: (open: boolean) => void;
}) {
	const t = useTranslations("CatalogueStock.import");
	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className="max-h-[90vh] max-w-2xl space-y-4 overflow-y-auto">
				<div className="space-y-1">
					<DialogTitle>{t("title")}</DialogTitle>
					<DialogDescription>
						{t("description", { max: IMPORT_MAX_ROWS })}
					</DialogDescription>
				</div>
				{/* Radix unmounts the body on close, so each opening starts clean. */}
				<ImportBody
					shopId={shopId}
					categories={categories}
					otherCategoryNames={otherCategoryNames}
					includeCost={includeCost}
					onClose={() => onOpenChange(false)}
				/>
			</DialogContent>
		</Dialog>
	);
}

function ImportBody({
	shopId,
	categories,
	otherCategoryNames,
	includeCost,
	onClose,
}: {
	shopId: string;
	categories: Category[];
	otherCategoryNames?: Record<string, string>;
	includeCost: boolean;
	onClose: () => void;
}) {
	const t = useTranslations("CatalogueStock.import");
	const tRoot = useTranslations();
	const fileId = useId();
	const [fileName, setFileName] = useState<string | null>(null);
	const [parsed, setParsed] = useState<ImportParse | null>(null);
	const [done, setDone] = useState(0);
	const [outcomes, setOutcomes] = useState<ImportOutcome[] | null>(null);
	const importProducts = useImportProducts(shopId);

	const valid = parsed?.rows.filter((row) => row.input) ?? [];
	const invalid = (parsed?.rows.length ?? 0) - valid.length;

	async function onFile(file: File | undefined) {
		setOutcomes(null);
		if (!file) return;
		setFileName(file.name);
		setParsed(
			parseProductImport(await file.text(), categories, {
				includeCost,
				otherCategoryNames,
			}),
		);
	}

	async function onConfirm() {
		setDone(0);
		const result = await importProducts.mutateAsync({
			rows: valid.flatMap((row) =>
				row.input
					? [{ line: row.line, title: row.title, input: row.input }]
					: [],
			),
			onProgress: setDone,
		});
		setOutcomes(result);
	}

	if (outcomes) {
		const created = outcomes.filter((outcome) => outcome.productId).length;
		const failed = outcomes.filter((outcome) => outcome.error);
		return (
			<div className="space-y-4">
				<p className="rounded-lg bg-ok-faint px-3 py-2 text-ok-ink text-sm">
					{t("created", { count: created })}
				</p>
				{failed.length > 0 && (
					<ul className="space-y-1 rounded-lg bg-red-50 px-3 py-2 text-red-700 text-sm">
						{failed.map((outcome) => (
							<li key={outcome.line}>
								{t("lineError", {
									line: outcome.line,
									title: outcome.title,
									message: resolveErrorMessage(outcome.error, tRoot),
								})}
							</li>
						))}
					</ul>
				)}
				<div className="flex justify-end">
					<Button type="button" onClick={onClose}>
						{t("close")}
					</Button>
				</div>
			</div>
		);
	}

	return (
		<div className="space-y-4">
			<div className="flex flex-wrap items-center gap-3">
				<label
					htmlFor={fileId}
					className="inline-flex h-10 cursor-pointer items-center gap-2 rounded-lg border border-line bg-surface px-4 font-semibold text-ink text-sm hover:border-[var(--shop-accent-border,var(--c-brand-line))]"
				>
					<Upload aria-hidden="true" className="h-4 w-4" />
					{fileName ?? t("chooseFile")}
				</label>
				<input
					id={fileId}
					type="file"
					accept=".csv,text/csv"
					className="sr-only"
					onChange={(event) => void onFile(event.target.files?.[0])}
				/>
				<a
					href={TEMPLATE_HREF}
					download="modele-catalogue.csv"
					className="inline-flex items-center gap-1 text-[var(--shop-accent-text,var(--c-brand))] text-sm hover:underline"
				>
					<Download aria-hidden="true" className="h-4 w-4" />
					{t("template")}
				</a>
			</div>
			<p className="text-ink-muted text-xs">{t("columns")}</p>

			{parsed && parsed.fileErrors.length > 0 && (
				<ul
					role="alert"
					className="rounded-lg bg-red-50 px-3 py-2 text-red-700 text-sm"
				>
					{parsed.fileErrors.map((key) => (
						<li key={key}>
							{t(`fileErrors.${key}`, { max: IMPORT_MAX_ROWS })}
						</li>
					))}
				</ul>
			)}

			{parsed && parsed.rows.length > 0 && (
				<>
					<p className="text-ink-soft text-sm">
						{t("summary", { valid: valid.length, invalid })}
					</p>
					<div className="max-h-72 overflow-y-auto rounded-lg border border-line">
						<table className="w-full text-sm">
							<thead className="sticky top-0 bg-canvas text-left text-ink-muted text-xs uppercase">
								<tr>
									<th className="px-3 py-2 font-semibold">{t("colLine")}</th>
									<th className="px-3 py-2 font-semibold">{t("colTitle")}</th>
									<th className="px-3 py-2 font-semibold">{t("colCheck")}</th>
								</tr>
							</thead>
							<tbody>
								{parsed.rows.map((row) => (
									<tr key={row.line} className="border-subtle border-t">
										<td className="px-3 py-2 text-ink-muted tabular-nums">
											{row.line}
										</td>
										<td className="px-3 py-2 text-ink">{row.title || "—"}</td>
										<td
											className={cn(
												"px-3 py-2 text-xs",
												row.input ? "text-ok-ink" : "text-bad-ink",
											)}
										>
											{row.input
												? t("rowOk")
												: row.errors
														.map((key) => t(`errors.${key}`))
														.join(" · ")}
										</td>
									</tr>
								))}
							</tbody>
						</table>
					</div>
				</>
			)}

			{importProducts.isError && (
				<p
					role="alert"
					className="rounded-lg bg-red-50 px-3 py-2 text-red-700 text-sm"
				>
					{resolveErrorMessage(importProducts.error, tRoot)}
				</p>
			)}

			<div className="flex justify-end gap-2">
				<Button type="button" variant="outline" onClick={onClose}>
					{t("cancel")}
				</Button>
				<Button
					type="button"
					disabled={valid.length === 0 || importProducts.isPending}
					onClick={() => void onConfirm()}
					className="bg-[var(--shop-accent,var(--c-brand))] text-[var(--shop-on-accent,#FFFFFF)] hover:bg-[var(--shop-accent-hover,var(--c-brand-strong))]"
				>
					{importProducts.isPending && (
						<LoaderCircle
							aria-hidden="true"
							className="mr-2 h-4 w-4 animate-spin"
						/>
					)}
					{importProducts.isPending
						? t("progress", { done, total: valid.length })
						: t("confirm", { count: valid.length })}
				</Button>
			</div>
		</div>
	);
}
