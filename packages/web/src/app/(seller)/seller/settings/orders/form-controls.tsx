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
			className="flex min-h-11 cursor-pointer items-center gap-3 text-[#0F172A] text-sm"
		>
			<input
				id={id}
				type="checkbox"
				className="h-5 w-5 rounded border-[#CBD5E1] accent-[#1E40AF]"
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
		<fieldset className="space-y-3 rounded-2xl border border-[#E2E8F0] bg-white p-5">
			<legend className="px-1 font-semibold text-[#0F172A] text-sm">
				{title}
			</legend>
			{children}
		</fieldset>
	);
}
