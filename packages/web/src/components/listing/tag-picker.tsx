"use client";

import { useEffect, useState } from "react";
import { cn } from "~/lib/utils";

interface Tag {
	id: string;
	name: string;
	slug: string;
	emoji?: string;
}

interface TagPickerProps {
	selectedIds: string[];
	onChange: (ids: string[]) => void;
}

export function TagPicker({ selectedIds, onChange }: TagPickerProps) {
	const [tags, setTags] = useState<Tag[]>([]);

	useEffect(() => {
		fetch("/api/public/tags")
			.then((r) => r.json())
			.then((data) => setTags(Array.isArray(data) ? data : []))
			.catch(() => {});
	}, []);

	if (tags.length === 0) return null;

	function toggle(id: string) {
		onChange(
			selectedIds.includes(id)
				? selectedIds.filter((x) => x !== id)
				: [...selectedIds, id],
		);
	}

	return (
		<div className="flex flex-wrap gap-2">
			{tags.map((tag) => {
				const active = selectedIds.includes(tag.id);
				return (
					<button
						key={tag.id}
						type="button"
						onClick={() => toggle(tag.id)}
						className={cn(
							"inline-flex items-center gap-1 rounded-full border px-3 py-1 text-sm transition-colors",
							active
								? "border-primary bg-primary/10 font-medium text-primary"
								: "border-border bg-background text-muted-foreground hover:border-primary/50",
						)}
					>
						{tag.emoji && <span>{tag.emoji}</span>}
						{tag.name}
					</button>
				);
			})}
		</div>
	);
}
