"use client";

import { Check, ChevronDown, Search, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { CategoryIcon } from "~/components/category-icon";
import type { Category } from "~/types";

interface CategoryNode extends Category {
	children: CategoryNode[];
	depth: number;
}

function buildTree(categories: Category[]): CategoryNode[] {
	const map = new Map<string, CategoryNode>();
	const roots: CategoryNode[] = [];

	for (const cat of categories) {
		map.set(cat.id, { ...cat, children: [], depth: 0 });
	}

	for (const cat of categories) {
		const node = map.get(cat.id);
		if (!node) continue;
		const parentId =
			typeof cat.parent === "string"
				? cat.parent
				: (cat.parent as Category | null)?.id;

		if (parentId && map.has(parentId)) {
			const parent = map.get(parentId);
			if (parent) {
				node.depth = parent.depth + 1;
				parent.children.push(node);
			}
		} else if (!parentId) {
			roots.push(node);
		}
	}

	return roots;
}

function flattenTree(nodes: CategoryNode[]): CategoryNode[] {
	const result: CategoryNode[] = [];
	function walk(list: CategoryNode[]) {
		for (const node of list) {
			result.push(node);
			if (node.children.length > 0) walk(node.children);
		}
	}
	walk(nodes);
	return result;
}

function matchesSearch(cat: CategoryNode, query: string): boolean {
	const q = query.toLowerCase();
	return cat.name.toLowerCase().includes(q);
}

// ── Dropdown mode (edit form, search filter) ──

interface CategoryDropdownProps {
	categories: Category[];
	value?: string;
	onChange: (categoryId: string) => void;
	placeholder?: string;
	showAll?: boolean;
}

export function CategoryDropdown({
	categories,
	value,
	onChange,
	placeholder = "Select a category",
	showAll = false,
}: CategoryDropdownProps) {
	const [open, setOpen] = useState(false);
	const [search, setSearch] = useState("");
	const ref = useRef<HTMLDivElement>(null);
	const inputRef = useRef<HTMLInputElement>(null);

	const tree = useMemo(() => buildTree(categories), [categories]);
	const flat = useMemo(() => flattenTree(tree), [tree]);

	const filtered = useMemo(() => {
		if (!search) return flat;
		return flat.filter((cat) => matchesSearch(cat, search));
	}, [flat, search]);

	const selectedCat = categories.find((c) => String(c.id) === value);

	useEffect(() => {
		function handleClickOutside(e: MouseEvent) {
			if (ref.current && !ref.current.contains(e.target as Node)) {
				setOpen(false);
			}
		}
		document.addEventListener("mousedown", handleClickOutside);
		return () => document.removeEventListener("mousedown", handleClickOutside);
	}, []);

	useEffect(() => {
		if (open && inputRef.current) {
			inputRef.current.focus();
		}
	}, [open]);

	return (
		<div ref={ref} className="relative">
			<button
				type="button"
				onClick={() => setOpen(!open)}
				className="flex h-9 w-full items-center justify-between rounded-lg border border-[#E2E8F0] bg-white px-3 text-sm transition-colors hover:border-[#93C5FD] focus:outline-none focus:ring-2 focus:ring-[#3B82F6]/20"
			>
				<span className={selectedCat ? "text-[#0F172A]" : "text-[#94A3B8]"}>
					{selectedCat ? selectedCat.name : placeholder}
				</span>
				<ChevronDown className="h-4 w-4 text-[#94A3B8]" />
			</button>

			{open && (
				<div className="absolute top-full left-0 z-50 mt-1 w-full rounded-xl border border-[#E2E8F0] bg-white shadow-lg">
					{/* Search */}
					<div className="border-[#E2E8F0] border-b p-2">
						<div className="relative">
							<Search className="-translate-y-1/2 absolute top-1/2 left-2.5 h-4 w-4 text-[#94A3B8]" />
							<input
								ref={inputRef}
								type="text"
								placeholder="Search categories..."
								className="h-8 w-full rounded-md bg-[#F8FAFC] pr-8 pl-8 text-[#0F172A] text-sm placeholder:text-[#94A3B8] focus:outline-none"
								value={search}
								onChange={(e) => setSearch(e.target.value)}
							/>
							{search && (
								<button
									type="button"
									onClick={() => setSearch("")}
									className="-translate-y-1/2 absolute top-1/2 right-2 text-[#94A3B8] hover:text-[#0F172A]"
								>
									<X className="h-3.5 w-3.5" />
								</button>
							)}
						</div>
					</div>

					{/* Options */}
					<div className="max-h-60 overflow-y-auto p-1">
						{showAll && (
							<button
								type="button"
								onClick={() => {
									onChange("");
									setOpen(false);
									setSearch("");
								}}
								className={`flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm transition-colors hover:bg-[#F1F5F9] ${
									!value
										? "bg-[#EFF6FF] font-medium text-[#1E40AF]"
										: "text-[#475569]"
								}`}
							>
								All categories
							</button>
						)}
						{filtered.map((cat) => {
							const isSelected = String(cat.id) === value;
							return (
								<button
									key={cat.id}
									type="button"
									onClick={() => {
										onChange(String(cat.id));
										setOpen(false);
										setSearch("");
									}}
									className={`flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm transition-colors hover:bg-[#F1F5F9] ${
										isSelected
											? "bg-[#EFF6FF] font-medium text-[#1E40AF]"
											: "text-[#0F172A]"
									}`}
									style={{ paddingLeft: `${cat.depth * 16 + 12}px` }}
								>
									<CategoryIcon category={cat} size={24} />
									<span className="flex-1">{cat.name}</span>
									{isSelected && (
										<Check className="h-4 w-4 shrink-0 text-[#1E40AF]" />
									)}
								</button>
							);
						})}
						{filtered.length === 0 && (
							<p className="px-3 py-4 text-center text-[#94A3B8] text-sm">
								No categories found
							</p>
						)}
					</div>
				</div>
			)}
		</div>
	);
}

// ── Grid mode (create form) ──

interface CategoryGridProps {
	categories: Category[];
	value?: string;
	onChange: (categoryId: string) => void;
}

export function CategoryGrid({
	categories,
	value,
	onChange,
}: CategoryGridProps) {
	const [search, setSearch] = useState("");

	const tree = useMemo(() => buildTree(categories), [categories]);
	const flat = useMemo(() => flattenTree(tree), [tree]);

	// Only show root categories in grid, or filtered results
	const displayed = useMemo(() => {
		if (!search) return tree;
		return flat.filter((cat) => matchesSearch(cat, search));
	}, [tree, flat, search]);

	return (
		<div className="space-y-3">
			{/* Search */}
			<div className="relative">
				<Search className="-translate-y-1/2 absolute top-1/2 left-3 h-4 w-4 text-[#94A3B8]" />
				<input
					type="text"
					placeholder="Search categories..."
					className="h-10 w-full rounded-lg border border-[#E2E8F0] bg-[#F8FAFC] pr-9 pl-10 text-[#0F172A] text-sm placeholder:text-[#94A3B8] focus:border-[#93C5FD] focus:outline-none focus:ring-2 focus:ring-[#3B82F6]/20"
					value={search}
					onChange={(e) => setSearch(e.target.value)}
				/>
				{search && (
					<button
						type="button"
						onClick={() => setSearch("")}
						className="-translate-y-1/2 absolute top-1/2 right-3 text-[#94A3B8] hover:text-[#0F172A]"
					>
						<X className="h-4 w-4" />
					</button>
				)}
			</div>

			{/* Grid */}
			{search ? (
				// Flat results when searching
				<div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
					{displayed.map((cat) => (
						<button
							key={cat.id}
							type="button"
							onClick={() => onChange(String(cat.id))}
							className={`flex items-center gap-3 rounded-xl border-2 p-3 text-left transition-all hover:shadow-sm ${
								value === String(cat.id)
									? "border-[#1E40AF] bg-[#EFF6FF] shadow-sm"
									: "border-[#E2E8F0] bg-white hover:border-[#93C5FD]"
							}`}
						>
							<CategoryIcon category={cat} size={32} />
							<div className="min-w-0 flex-1">
								<p className="truncate font-medium text-[#0F172A] text-sm">
									{cat.name}
								</p>
							</div>
							{value === String(cat.id) && (
								<Check className="h-4 w-4 shrink-0 text-[#1E40AF]" />
							)}
						</button>
					))}
				</div>
			) : (
				// Hierarchical grid when not searching
				<div className="space-y-4">
					{displayed.map((parent) => (
						<div key={(parent as CategoryNode).id}>
							{/* Parent as header */}
							<button
								type="button"
								onClick={() => onChange(String((parent as CategoryNode).id))}
								className={`mb-2 flex w-full items-center gap-3 rounded-xl border-2 p-3 text-left transition-all hover:shadow-sm ${
									value === String((parent as CategoryNode).id)
										? "border-[#1E40AF] bg-[#EFF6FF] shadow-sm"
										: "border-[#E2E8F0] bg-white hover:border-[#93C5FD]"
								}`}
							>
								<CategoryIcon category={parent as Category} size={36} />
								<div className="min-w-0 flex-1">
									<p className="font-semibold text-[#0F172A] text-sm">
										{(parent as CategoryNode).name}
									</p>
									{(parent as CategoryNode).children.length > 0 && (
										<p className="text-[#94A3B8] text-xs">
											{(parent as CategoryNode).children.length} subcategories
										</p>
									)}
								</div>
								{value === String((parent as CategoryNode).id) && (
									<Check className="h-4 w-4 shrink-0 text-[#1E40AF]" />
								)}
							</button>

							{/* Children */}
							{(parent as CategoryNode).children.length > 0 && (
								<div className="ml-4 grid grid-cols-2 gap-2 sm:grid-cols-3">
									{(parent as CategoryNode).children.map((child) => (
										<button
											key={child.id}
											type="button"
											onClick={() => onChange(String(child.id))}
											className={`flex items-center gap-2 rounded-lg border p-2.5 text-left text-sm transition-all hover:shadow-sm ${
												value === String(child.id)
													? "border-[#1E40AF] bg-[#EFF6FF]"
													: "border-[#E2E8F0] hover:border-[#93C5FD]"
											}`}
										>
											<CategoryIcon category={child} size={24} />
											<span className="min-w-0 flex-1 truncate">
												{child.name}
											</span>
											{value === String(child.id) && (
												<Check className="h-3.5 w-3.5 shrink-0 text-[#1E40AF]" />
											)}
										</button>
									))}
								</div>
							)}
						</div>
					))}
				</div>
			)}

			{displayed.length === 0 && (
				<p className="py-6 text-center text-[#94A3B8] text-sm">
					No categories found
				</p>
			)}
		</div>
	);
}
