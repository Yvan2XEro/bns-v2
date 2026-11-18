"use client";

import type { InputHTMLAttributes, ReactNode } from "react";

export function Toggle({
	id,
	label,
	...input
}: { id: string; label: string } & InputHTMLAttributes<HTMLInputElement>) {
	return (
		<label
			htmlFor={id}
			className="flex min-h-11 cursor-pointer items-center gap-3 text-ink text-sm"
		>
			<input
				id={id}
				type="checkbox"
				className="h-5 w-5 rounded border-line-strong accent-[var(--shop-accent,var(--c-brand))]"
				{...input}
			/>
			{label}
		</label>
	);
}

export function FieldError({ children }: { children: ReactNode }) {
	if (!children) return null;
	return <p className="text-red-600 text-xs">{children}</p>;
}

export function Section({
	title,
	children,
}: {
	title: string;
	children: ReactNode;
}) {
	return (
		<fieldset className="space-y-3 rounded-2xl border border-line bg-surface p-5">
			<legend className="px-1 font-semibold text-ink text-sm">{title}</legend>
			{children}
		</fieldset>
	);
}
