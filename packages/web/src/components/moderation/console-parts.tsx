"use client";

import { useTranslations } from "next-intl";
import type { ReactNode } from "react";
import { resolveErrorMessage } from "~/lib/apiError";
import { cn } from "~/lib/utils";

/** Loading, error, empty and load-more states shared by the console lists. */
export function ListLoading({ label }: { label: string }) {
	return (
		<output
			aria-label={label}
			className="block h-48 animate-pulse rounded-xl bg-subtle"
		/>
	);
}

export function ListError({
	error,
	fallback,
	onRetry,
}: {
	error: unknown;
	fallback: string;
	onRetry: () => void;
}) {
	const t = useTranslations("ModerationConsole");
	const tRoot = useTranslations();
	return (
		<div
			role="alert"
			className="rounded-xl border border-line bg-surface p-8 text-center"
		>
			<p className="font-semibold text-ink">
				{resolveErrorMessage(error, tRoot, fallback)}
			</p>
			<button
				type="button"
				onClick={onRetry}
				className="mt-4 h-10 rounded-lg bg-brand-fill px-4 font-semibold text-sm text-white focus-visible:outline-2 focus-visible:outline-brand focus-visible:outline-offset-2"
			>
				{t("queue.retry")}
			</button>
		</div>
	);
}

export function ListEmpty({ children }: { children: ReactNode }) {
	return (
		<p className="rounded-xl border border-line bg-surface p-8 text-center text-ink-muted text-sm">
			{children}
		</p>
	);
}

export function LoadMore({
	onClick,
	loading,
}: {
	onClick: () => void;
	loading: boolean;
}) {
	const t = useTranslations("ModerationConsole");
	return (
		<div className="text-center">
			<button
				type="button"
				onClick={onClick}
				disabled={loading}
				className="h-10 rounded-lg border border-line-strong bg-surface px-4 font-semibold text-ink text-sm hover:bg-subtle focus-visible:outline-2 focus-visible:outline-brand disabled:opacity-60"
			>
				{loading ? t("queue.loadingMore") : t("queue.loadMore")}
			</button>
		</div>
	);
}

/** A titled block inside a side panel. */
export function PanelSection({
	title,
	children,
	className,
}: {
	title: string;
	children: ReactNode;
	className?: string;
}) {
	return (
		<section className={cn("space-y-2", className)}>
			<h3 className="font-semibold text-[11px] text-ink-muted uppercase tracking-wide">
				{title}
			</h3>
			{children}
		</section>
	);
}

export function KeyValue({
	label,
	children,
}: {
	label: string;
	children: ReactNode;
}) {
	return (
		<div className="flex justify-between gap-3 text-sm">
			<dt className="shrink-0 text-ink-muted">{label}</dt>
			<dd className="min-w-0 break-words text-right font-semibold text-ink">
				{children}
			</dd>
		</div>
	);
}

export function PanelError({
	error,
	fallback,
}: {
	error: unknown;
	fallback: string;
}) {
	const tRoot = useTranslations();
	return (
		<p
			role="alert"
			className="rounded-lg border border-bad-line bg-bad-faint px-3 py-2 text-bad-ink text-sm"
		>
			{resolveErrorMessage(error, tRoot, fallback)}
		</p>
	);
}

/** A textarea with its label, a character counter and an optional error line. */
export function DecisionText({
	id,
	label,
	value,
	onChange,
	required,
	max,
	placeholder,
	error,
}: {
	id: string;
	label: string;
	value: string;
	onChange: (value: string) => void;
	required: boolean;
	max: number;
	placeholder?: string;
	error?: string | null;
}) {
	const t = useTranslations("ModerationConsole");
	return (
		<div className="space-y-1.5">
			<label htmlFor={id} className="font-semibold text-ink-soft text-sm">
				{label}
				{required ? null : (
					<span className="ml-1 font-normal text-ink-muted">
						{t("decision.optional")}
					</span>
				)}
			</label>
			<textarea
				id={id}
				value={value}
				onChange={(event) => onChange(event.target.value)}
				rows={3}
				maxLength={max}
				placeholder={placeholder}
				aria-required={required}
				aria-invalid={error ? true : undefined}
				aria-describedby={error ? `${id}-error` : undefined}
				className="block w-full resize-y rounded-lg border border-line bg-surface px-3 py-2 text-ink text-sm placeholder:text-ink-ghost focus-visible:border-brand focus-visible:outline-2 focus-visible:outline-brand"
			/>
			{error ? (
				<p id={`${id}-error`} className="text-bad-ink text-xs">
					{error}
				</p>
			) : null}
		</div>
	);
}

/** One choice in a decision radio group, with its explanation underneath. */
export function DecisionOption({
	name,
	value,
	checked,
	onChange,
	title,
	body,
	tone = "neutral",
}: {
	name: string;
	value: string;
	checked: boolean;
	onChange: (value: string) => void;
	title: string;
	body?: string;
	tone?: "neutral" | "danger";
}) {
	return (
		<label
			className={cn(
				"flex cursor-pointer gap-3 rounded-lg border p-3 has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-brand",
				checked
					? tone === "danger"
						? "border-bad-line bg-bad-faint"
						: "border-brand bg-brand-soft"
					: "border-line bg-surface hover:border-line-strong",
			)}
		>
			<input
				type="radio"
				name={name}
				value={value}
				checked={checked}
				onChange={() => onChange(value)}
				className="mt-0.5 h-4 w-4 shrink-0 accent-brand"
			/>
			<span className="min-w-0">
				<span
					className={cn(
						"block font-semibold text-sm",
						tone === "danger" ? "text-bad-ink" : "text-ink",
					)}
				>
					{title}
				</span>
				{body ? (
					<span className="mt-0.5 block text-ink-muted text-xs">{body}</span>
				) : null}
			</span>
		</label>
	);
}

/**
 * The apply step: a first press asks for confirmation in place, the second
 * sends. Decisions are not reversible from the console, so none goes out on
 * a single click.
 */
export function ConfirmApply({
	confirming,
	pending,
	disabled,
	applyLabel,
	confirmText,
	confirmLabel,
	onApply,
	onConfirm,
	onCancel,
	danger,
}: {
	confirming: boolean;
	pending: boolean;
	disabled?: boolean;
	applyLabel: string;
	confirmText: string;
	confirmLabel: string;
	onApply: () => void;
	onConfirm: () => void;
	onCancel: () => void;
	danger?: boolean;
}) {
	const t = useTranslations("ModerationConsole");
	const primary = cn(
		"h-10 rounded-lg px-4 font-semibold text-sm text-white focus-visible:outline-2 focus-visible:outline-brand focus-visible:outline-offset-2 disabled:opacity-60",
		danger ? "bg-bad hover:opacity-90" : "bg-brand-fill hover:bg-brand-strong",
	);
	if (!confirming)
		return (
			<button
				type="button"
				onClick={onApply}
				disabled={disabled || pending}
				className={cn(primary, "w-full")}
			>
				{applyLabel}
			</button>
		);
	return (
		<fieldset className="space-y-2 rounded-lg border border-line-strong bg-canvas p-3">
			<legend className="float-left mb-2 w-full font-semibold text-ink text-sm">
				{confirmText}
			</legend>
			<div className="flex gap-2">
				<button
					type="button"
					onClick={onCancel}
					disabled={pending}
					className="h-10 flex-1 rounded-lg border border-line-strong bg-surface px-3 font-semibold text-ink text-sm hover:bg-subtle focus-visible:outline-2 focus-visible:outline-brand disabled:opacity-60"
				>
					{t("decision.cancel")}
				</button>
				<button
					type="button"
					onClick={onConfirm}
					disabled={pending}
					className={cn(primary, "flex-1")}
				>
					{pending ? t("decision.sending") : confirmLabel}
				</button>
			</div>
		</fieldset>
	);
}
