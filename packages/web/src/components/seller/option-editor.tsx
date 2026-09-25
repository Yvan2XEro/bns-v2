"use client";

import { Plus, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { MAX_OPTIONS, type OptionRow } from "~/lib/product-form";

function ValueAdder({ onAdd }: { onAdd: (value: string) => void }) {
	const t = useTranslations("ProductEditor");
	const [draft, setDraft] = useState("");
	const commit = () => {
		const value = draft.trim();
		if (value) onAdd(value);
		setDraft("");
	};
	return (
		<input
			value={draft}
			onChange={(event) => setDraft(event.target.value)}
			onKeyDown={(event) => {
				if (event.key === "Enter" || event.key === ",") {
					event.preventDefault();
					commit();
				}
			}}
			onBlur={commit}
			placeholder={t("addValue")}
			aria-label={t("addValue")}
			className="h-8 w-32 rounded-full border border-[#E2E8F0] border-dashed px-3 text-sm outline-none focus:border-[#93C5FD]"
		/>
	);
}

/**
 * The option name, committed on blur or Enter rather than on every keystroke.
 *
 * Renaming an option rebuilds every combination, so a per-keystroke commit
 * would walk the variants through a half-typed name — and through the empty
 * name in between, which has no combinations at all. It also refuses a name
 * another option already holds, which the server would reject on save, and an
 * empty one: the X button is how an option goes away.
 */
function NameField({
	name,
	taken,
	onCommit,
}: {
	name: string;
	taken: string[];
	onCommit: (name: string) => void;
}) {
	const t = useTranslations("ProductEditor");
	const [draft, setDraft] = useState(name);
	const [duplicate, setDuplicate] = useState(false);

	const commit = () => {
		const next = draft.trim();
		if (!next || next === name) {
			setDuplicate(false);
			setDraft(name);
			return;
		}
		if (taken.some((other) => other.toLowerCase() === next.toLowerCase())) {
			setDuplicate(true);
			return;
		}
		setDuplicate(false);
		onCommit(next);
	};

	return (
		<div className="flex-1">
			<input
				value={draft}
				onChange={(event) => setDraft(event.target.value)}
				onKeyDown={(event) => {
					if (event.key === "Enter") {
						event.preventDefault();
						commit();
					}
				}}
				onBlur={commit}
				placeholder={t("optionName")}
				aria-label={t("optionName")}
				aria-invalid={duplicate}
				className="h-9 w-full rounded-md border border-[#E2E8F0] px-3 font-semibold text-sm outline-none focus:border-[#93C5FD]"
			/>
			{duplicate && (
				<p className="mt-1 text-red-600 text-xs">{t("optionNameDuplicate")}</p>
			)}
		</div>
	);
}

export function OptionEditor({
	options,
	onChange,
}: {
	options: OptionRow[];
	onChange: (options: OptionRow[]) => void;
}) {
	const t = useTranslations("ProductEditor");

	const update = (index: number, next: OptionRow) =>
		onChange(options.map((option, i) => (i === index ? next : option)));

	return (
		<div className="space-y-3">
			{options.map((option, index) => (
				// An option has no id until it is saved, and its inputs are
				// controlled, so the position is the only identity available.
				<div key={index} className="rounded-lg border border-[#E2E8F0] p-3">
					<div className="flex items-start gap-2">
						<NameField
							// Reseeds the draft when this position starts holding
							// another option, after one above it was removed.
							key={option.name}
							name={option.name}
							taken={options
								.filter((_, i) => i !== index)
								.map((other) => other.name.trim())
								.filter(Boolean)}
							onCommit={(name) => update(index, { ...option, name })}
						/>
						<button
							type="button"
							onClick={() => onChange(options.filter((_, i) => i !== index))}
							className="flex h-9 w-9 items-center justify-center rounded-md text-[#94A3B8] hover:bg-[#FEF2F2] hover:text-[#DC2626]"
							aria-label={t("removeOption")}
						>
							<X aria-hidden="true" className="h-4 w-4" />
						</button>
					</div>
					<div className="mt-2 flex flex-wrap items-center gap-2">
						{option.values.map((value) => (
							<span
								key={value}
								className="inline-flex items-center gap-1 rounded-full bg-[#EFF6FF] px-3 py-1 font-medium text-[#1E40AF] text-sm"
							>
								{value}
								<button
									type="button"
									onClick={() =>
										update(index, {
											...option,
											values: option.values.filter((v) => v !== value),
										})
									}
									aria-label={t("removeValue", { value })}
								>
									<X aria-hidden="true" className="h-3 w-3" />
								</button>
							</span>
						))}
						<ValueAdder
							onAdd={(value) => {
								if (!option.values.includes(value)) {
									update(index, {
										...option,
										values: [...option.values, value],
									});
								}
							}}
						/>
					</div>
				</div>
			))}
			{options.length < MAX_OPTIONS && (
				<button
					type="button"
					onClick={() => onChange([...options, { name: "", values: [] }])}
					className="inline-flex items-center gap-1 font-semibold text-[#1E40AF] text-sm"
				>
					<Plus aria-hidden="true" className="h-4 w-4" />
					{t("addOption")}
				</button>
			)}
		</div>
	);
}
