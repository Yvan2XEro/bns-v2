"use client";

import { ChevronDown, Tag, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { cn } from "~/lib/utils";

interface TagItem {
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
	const [tags, setTags] = useState<TagItem[]>([]);
	const [open, setOpen] = useState(false);
	const containerRef = useRef<HTMLDivElement>(null);

	useEffect(() => {
		fetch("/api/public/tags")
			.then((r) => r.json())
			.then((data) => setTags(Array.isArray(data) ? data : []))
			.catch(() => {
				// silently fail — tags are optional
			});
	}, []);

	useEffect(() => {
		function onClickOutside(e: MouseEvent) {
			if (
				containerRef.current &&
				!containerRef.current.contains(e.target as Node)
			) {
				setOpen(false);
			}
		}
		if (open) document.addEventListener("mousedown", onClickOutside);
		return () => document.removeEventListener("mousedown", onClickOutside);
	}, [open]);

	if (tags.length === 0) return null;

	const selectedTags = tags.filter((t) => selectedIds.includes(t.id));
	const availableTags = tags.filter((t) => !selectedIds.includes(t.id));

	function remove(id: string) {
		onChange(selectedIds.filter((x) => x !== id));
	}

	function add(id: string) {
		onChange([...selectedIds, id]);
	}

	return (
		<div ref={containerRef} className="relative">
			{/* Trigger field */}
			<button
				type="button"
				onClick={() => setOpen((o) => !o)}
				className={cn(
					"flex min-h-10 w-full flex-wrap items-center gap-1.5 rounded-md border bg-background px-3 py-2 text-sm transition-colors",
					open ? "border-ring ring-2 ring-ring/20" : "border-input",
				)}
			>
				{selectedTags.length === 0 ? (
					<span className="flex items-center gap-1.5 text-muted-foreground">
						<Tag className="h-3.5 w-3.5" />
						Ajouter des tags…
					</span>
				) : (
					selectedTags.map((tag) => (
						<span
							key={tag.id}
							className="inline-flex items-center gap-1 rounded-full border border-primary/30 bg-primary/10 px-2 py-0.5 text-primary text-xs"
						>
							{tag.emoji && <span>{tag.emoji}</span>}
							{tag.name}
							<button
								type="button"
								onClick={(e) => {
									e.stopPropagation();
									remove(tag.id);
								}}
								className="ml-0.5 hover:text-primary/60"
							>
								<X className="h-3 w-3" />
							</button>
						</span>
					))
				)}
				<ChevronDown
					className={cn(
						"ml-auto h-4 w-4 shrink-0 text-muted-foreground transition-transform",
						open && "rotate-180",
					)}
				/>
			</button>

			{/* Dropdown */}
			{open && (
				<div className="absolute top-full z-50 mt-1 w-full rounded-md border bg-popover p-3 shadow-md">
					{availableTags.length === 0 ? (
						<p className="text-center text-muted-foreground text-xs">
							Tous les tags sont sélectionnés
						</p>
					) : (
						<div className="flex flex-wrap gap-1.5">
							{availableTags.map((tag) => (
								<button
									key={tag.id}
									type="button"
									onClick={() => {
										add(tag.id);
									}}
									className="inline-flex items-center gap-1 rounded-full border border-border px-2.5 py-1 text-foreground text-xs transition-colors hover:border-primary/50 hover:bg-primary/5 hover:text-primary"
								>
									{tag.emoji && <span>{tag.emoji}</span>}
									{tag.name}
								</button>
							))}
						</div>
					)}
				</div>
			)}
		</div>
	);
}
