"use client";

import {
	Check,
	ChevronDown,
	Clock,
	ListChecks,
	Lock,
	Plus,
} from "lucide-react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { stepTarget } from "~/lib/seller-home";
import { cn } from "~/lib/utils";
import {
	actionableStep,
	type ChecklistMode,
	checklistProgress,
	type SetupStep,
} from "../../../../api/src/contracts/sellerOnboarding";

type T = ReturnType<typeof useTranslations<"SellerHome">>;

/** The row's second line: what is left, why it matters, or who can do it. */
export function stepBody(t: T, step: SetupStep): string {
	const base = `step.${step.key}`;
	if (step.done) return t(`${base}.done`);
	if (step.locked) return t("locked");
	if (step.pending) return t(`${base}.pending`);
	if (step.key === "profile" && step.missing?.length) {
		return t(`${base}.missing`, {
			parts: step.missing.map((part) => t(`part.${part}`)).join(", "),
		});
	}
	if (step.key === "product" && (step.drafts ?? 0) > 0) {
		return t(`${base}.drafts`, { count: step.drafts ?? 0 });
	}
	if (step.key === "move") return t(`${base}.body`, { count: step.count ?? 0 });
	return t(`${base}.body`);
}

function StepRow({ step, index }: { step: SetupStep; index: number | null }) {
	const t = useTranslations("SellerHome");
	const target = stepTarget(step);
	const actionable = actionableStep(step) && target.kind === "route";
	const inline = actionable && step.key === "product" && !(step.drafts ?? 0);

	const mark = (
		<span
			className={cn(
				"flex h-7 w-7 shrink-0 items-center justify-center rounded-full font-semibold text-xs",
				step.done
					? "bg-ok-soft text-ok-ink"
					: "border-2 border-line-strong border-dashed text-ink-muted",
			)}
		>
			{step.done ? (
				<Check aria-hidden="true" className="h-4 w-4" />
			) : step.pending ? (
				<Clock aria-hidden="true" className="h-3.5 w-3.5 text-warn-ink-soft" />
			) : step.locked ? (
				<Lock aria-hidden="true" className="h-3 w-3" />
			) : index !== null ? (
				index
			) : (
				<Plus aria-hidden="true" className="h-3.5 w-3.5" />
			)}
		</span>
	);
	const text = (
		<span className="min-w-0 flex-1">
			<span
				className={cn(
					"block font-medium text-sm",
					step.done ? "text-ink-muted line-through" : "text-ink",
				)}
			>
				{t(`step.${step.key}.title`)}
				{step.done && <span className="sr-only"> ({t("doneLabel")})</span>}
			</span>
			<span className="block text-ink-muted text-xs">{stepBody(t, step)}</span>
		</span>
	);

	if (!actionable || target.kind !== "route") {
		return (
			<li className="flex min-h-12 items-center gap-3 rounded-lg p-2">
				{mark}
				{text}
			</li>
		);
	}
	return (
		<li>
			<Link
				href={target.href}
				className="flex min-h-12 items-center gap-3 rounded-lg p-2 hover:bg-canvas focus-visible:outline-2 focus-visible:outline-[var(--shop-accent,var(--c-brand))]"
			>
				{mark}
				{text}
				{inline && (
					<span className="inline-flex h-9 items-center gap-1 rounded-lg bg-[var(--shop-accent,var(--c-brand))] px-3 font-semibold text-[var(--shop-on-accent,#FFFFFF)] text-sm">
						<Plus aria-hidden="true" className="h-4 w-4" />
						{t("add")}
					</span>
				)}
			</Link>
		</li>
	);
}

/**
 * « Premiers pas ». `mode` comes from the contract's `checklistMode`: the
 * full list while setting up, a dismissible "ready" card once the required
 * steps are done, one expandable line for an active shop with loose ends.
 */
export function SetupChecklist({
	steps,
	mode,
	onDismiss,
}: {
	steps: SetupStep[];
	mode: Exclude<ChecklistMode, "hidden">;
	onDismiss: () => void;
}) {
	const t = useTranslations("SellerHome");
	const [expanded, setExpanded] = useState(false);
	const progress = checklistProgress(steps);
	const left = progress.total - progress.done;

	if (mode === "collapsed" && !expanded) {
		return (
			<button
				type="button"
				onClick={() => setExpanded(true)}
				aria-expanded={false}
				className="flex w-full items-center gap-3 rounded-xl border border-line bg-surface p-4 text-left hover:bg-canvas"
			>
				<span className="inline-flex h-9 w-9 items-center justify-center rounded-[10px] bg-[var(--shop-accent-soft,var(--c-brand-tint))] text-[var(--shop-accent-text,var(--c-brand))]">
					<ListChecks aria-hidden="true" className="h-[18px] w-[18px]" />
				</span>
				<span className="flex-1 font-semibold text-ink text-sm">
					{t("collapsed", { count: left })}
				</span>
				<ChevronDown aria-hidden="true" className="h-4 w-4 text-ink-muted" />
			</button>
		);
	}

	const required = mode === "complete" ? [] : steps.filter((s) => s.required);
	const optional = steps.filter((s) => !s.required && (s.done || !s.locked));
	const percent = progress.total ? (progress.done / progress.total) * 100 : 0;

	return (
		<section
			aria-labelledby="setup-checklist-title"
			className="rounded-xl border border-line bg-surface p-5"
		>
			<div className="flex items-center justify-between gap-3">
				<h2
					id="setup-checklist-title"
					className="font-bold text-[17px] text-ink"
				>
					{mode === "complete" ? t("readyTitle") : t("checklistTitle")}
				</h2>
				<span className="font-bold text-[var(--shop-accent-text,var(--c-brand))] text-sm tabular-nums">
					{progress.done} / {progress.total}
				</span>
			</div>
			{mode === "complete" && (
				<p className="mt-1 text-ink-soft text-sm">{t("readyBody")}</p>
			)}
			<div
				role="progressbar"
				aria-label={t("checklistTitle")}
				aria-valuemin={0}
				aria-valuemax={progress.total}
				aria-valuenow={progress.done}
				className="mt-3 h-1.5 overflow-hidden rounded-full bg-line"
			>
				<div
					className="h-1.5 rounded-full bg-[var(--shop-accent,var(--c-brand))]"
					style={{ width: `${percent}%` }}
				/>
			</div>
			{required.length > 0 && (
				<ol className="mt-3 space-y-1">
					{required.map((step, index) => (
						<StepRow key={step.key} step={step} index={index + 1} />
					))}
				</ol>
			)}
			{optional.length > 0 && (
				<>
					<h3 className="mt-4 font-semibold text-ink-muted text-xs uppercase tracking-[0.4px]">
						{t("further")}
					</h3>
					<ul className="mt-1 space-y-1">
						{optional.map((step) => (
							<StepRow key={step.key} step={step} index={null} />
						))}
					</ul>
				</>
			)}
			{mode === "complete" && (
				<button
					type="button"
					onClick={onDismiss}
					className="mt-3 h-10 rounded-lg border border-line px-4 font-semibold text-ink-soft text-sm hover:bg-canvas"
				>
					{t("hideChecklist")}
				</button>
			)}
		</section>
	);
}
