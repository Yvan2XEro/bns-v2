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
					<div className="flex items-center gap-2">
						<input
							value={option.name}
							onChange={(event) =>
								update(index, { ...option, name: event.target.value })
							}
							placeholder={t("optionName")}
							aria-label={t("optionName")}
							className="h-9 flex-1 rounded-md border border-[#E2E8F0] px-3 font-semibold text-sm outline-none focus:border-[#93C5FD]"
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
