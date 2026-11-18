"use client";

import type { UseFormRegisterReturn } from "react-hook-form";

/** A labelled radio group bound to one react-hook-form field. */
export function ReasonRadios({
	legend,
	name,
	options,
	register,
	error,
}: {
	legend: string;
	name: string;
	options: Array<{ value: string; label: string }>;
	register: UseFormRegisterReturn;
	error: string | null;
}) {
	return (
		<fieldset className="space-y-2" aria-invalid={Boolean(error)}>
			<legend className="mb-1 font-medium text-ink text-sm">{legend}</legend>
			{options.map((option) => (
				<label
					key={option.value}
					className="flex min-h-11 cursor-pointer items-center gap-3 rounded-lg border border-line px-3 text-sm has-[:checked]:border-[var(--shop-accent,var(--c-brand))] has-[:checked]:bg-[var(--shop-accent-soft,var(--c-brand-soft))]"
				>
					<input
						type="radio"
						value={option.value}
						{...register}
						name={name}
						className="h-4 w-4"
					/>
					{option.label}
				</label>
			))}
			{error && (
				<p role="alert" className="text-red-700 text-sm">
					{error}
				</p>
			)}
		</fieldset>
	);
}
