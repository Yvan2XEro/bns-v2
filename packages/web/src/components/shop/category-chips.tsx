"use client";

import { Check } from "lucide-react";
import { cn } from "~/lib/utils";

/** Only what a chip renders and selects by; a shop's own (possibly non-root) categories fit this without a cast. */
export interface CategoryChipOption {
	id: string;
	name: string;
}

export function CategoryChips({
	categories,
	selected,
	onChange,
	max = 5,
}: {
	categories: CategoryChipOption[];
	selected: string[];
	onChange: (ids: string[]) => void;
	max?: number;
}) {
	function toggle(id: string) {
		if (selected.includes(id)) {
			onChange(selected.filter((value) => value !== id));
		} else if (selected.length < max) {
			onChange([...selected, id]);
		}
	}

	return (
		<div className="flex flex-wrap gap-2">
			{categories.map((category) => {
				const active = selected.includes(category.id);
				const blocked = !active && selected.length >= max;
				return (
					<button
						key={category.id}
						type="button"
						onClick={() => toggle(category.id)}
						disabled={blocked}
						aria-pressed={active}
						className={cn(
							"inline-flex items-center gap-1 rounded-full border px-3 py-1.5 font-medium text-sm transition-colors",
							active
								? "border-[#BFDBFE] bg-[#DBEAFE] text-[#1E40AF]"
								: "border-[#E2E8F0] bg-white text-[#334155] hover:border-[#93C5FD]",
							blocked && "cursor-not-allowed opacity-50",
						)}
					>
						{active && <Check className="h-3.5 w-3.5" />}
						{category.name}
					</button>
				);
			})}
		</div>
	);
}
