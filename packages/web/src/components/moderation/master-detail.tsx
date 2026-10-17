"use client";

import { ArrowLeft, X } from "lucide-react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import type { ReactNode } from "react";
import { cn } from "~/lib/utils";

/**
 * List on the left, detail panel on the right from `xl` up. Below `xl` an
 * open detail replaces the list full-width, with a back button. Selection
 * lives in the URL (`useUrlSelection`), so `open` and `onClose` come from it.
 */
export function MasterDetail({
	list,
	detail,
	open,
	onClose,
	placeholder,
}: {
	list: ReactNode;
	/** The open item's panel; ignored while `open` is false. */
	detail: ReactNode;
	open: boolean;
	onClose: () => void;
	/** Shown in the panel column at `xl` when nothing is open; defaults to `DetailEmpty`. */
	placeholder?: ReactNode;
}) {
	const t = useTranslations("ModerationConsole");
	return (
		<div className="xl:grid xl:grid-cols-[minmax(0,1fr)_380px] xl:items-start xl:gap-6">
			<div className={cn("min-w-0", open && "hidden xl:block")}>{list}</div>
			{open ? (
				<section
					aria-label={t("panel.label")}
					className="min-w-0 rounded-xl border border-line bg-surface xl:sticky xl:top-6"
				>
					<div className="flex items-center justify-between border-line border-b px-4 py-2">
						<button
							type="button"
							onClick={onClose}
							className="inline-flex items-center gap-2 rounded-lg px-2 py-1.5 font-medium text-ink-soft text-sm hover:bg-subtle focus-visible:outline-2 focus-visible:outline-brand xl:hidden"
						>
							<ArrowLeft aria-hidden="true" className="h-4 w-4" />
							{t("panel.back")}
						</button>
						<button
							type="button"
							onClick={onClose}
							aria-label={t("panel.close")}
							className="ml-auto hidden rounded-lg p-1.5 text-ink-muted hover:bg-subtle hover:text-ink focus-visible:outline-2 focus-visible:outline-brand xl:inline-flex"
						>
							<X aria-hidden="true" className="h-4 w-4" />
						</button>
					</div>
					<div className="p-4">{detail}</div>
				</section>
			) : (
				<div className="hidden xl:block">{placeholder ?? <DetailEmpty />}</div>
			)}
		</div>
	);
}

function PanelMessage({ title, body }: { title: string; body: string }) {
	return (
		<div className="rounded-xl border border-line border-dashed bg-surface p-6 text-center">
			<p className="font-semibold text-ink text-sm">{title}</p>
			<p className="mt-1 text-ink-muted text-sm">{body}</p>
		</div>
	);
}

/** Nothing selected yet. */
export function DetailEmpty() {
	const t = useTranslations("ModerationConsole");
	return (
		<PanelMessage title={t("panel.emptyTitle")} body={t("panel.emptyBody")} />
	);
}

/** The URL names an item the list does not hold (handled since, or further down). */
export function DetailNotFound() {
	const t = useTranslations("ModerationConsole");
	return (
		<div className="text-center">
			<p className="font-semibold text-ink text-sm">
				{t("panel.notFoundTitle")}
			</p>
			<p className="mt-1 text-ink-muted text-sm">{t("panel.notFoundBody")}</p>
		</div>
	);
}

/** Title, subtitle and actions above a console list. */
export function ConsoleHeader({
	title,
	subtitle,
	actions,
}: {
	title: string;
	subtitle?: ReactNode;
	actions?: ReactNode;
}) {
	return (
		<div className="flex flex-wrap items-start justify-between gap-3">
			<div className="min-w-0">
				<h1 className="font-bold font-heading text-2xl text-ink">{title}</h1>
				{subtitle ? (
					<p className="mt-1 text-ink-muted text-sm">{subtitle}</p>
				) : null}
			</div>
			{actions ? (
				<div className="flex flex-wrap items-center gap-2">{actions}</div>
			) : null}
		</div>
	);
}

/** A filter pill with an optional count; the active one is filled dark. */
export function FilterChip({
	href,
	active,
	count,
	children,
}: {
	href: string;
	active: boolean;
	count?: number | null;
	children: ReactNode;
}) {
	return (
		<Link
			href={href}
			scroll={false}
			aria-current={active ? "true" : undefined}
			className={cn(
				"inline-flex h-8 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border px-3 font-medium text-[13px] focus-visible:outline-2 focus-visible:outline-brand focus-visible:outline-offset-2",
				active
					? "border-ink bg-ink font-semibold text-surface"
					: "border-line bg-surface text-ink-soft hover:border-line-strong",
			)}
		>
			{children}
			{count != null ? (
				<span
					className={cn(
						"font-bold text-[11px]",
						active ? "text-surface/75" : "text-ink-muted",
					)}
				>
					{count}
				</span>
			) : null}
		</Link>
	);
}
