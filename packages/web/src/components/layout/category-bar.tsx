"use client";

import { ChevronDown, ChevronLeft, Grid3X3, X } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import type { Category } from "~/types";

interface CategoryNode extends Category {
	children: CategoryNode[];
}

function buildTree(categories: Category[]): CategoryNode[] {
	const map = new Map<string, CategoryNode>();
	const roots: CategoryNode[] = [];

	for (const cat of categories) {
		map.set(cat.id, { ...cat, children: [] });
	}

	for (const cat of categories) {
		const node = map.get(cat.id);
		if (!node) continue;
		const parentId =
			typeof cat.parent === "string"
				? cat.parent
				: (cat.parent as Category | null)?.id;

		if (parentId && map.has(parentId)) {
			map.get(parentId)?.children.push(node);
		} else if (!parentId) {
			roots.push(node);
		}
	}

	return roots;
}

function CategoryEmoji({ icon, name }: { icon?: string | null; name: string }) {
	return (
		<span role="img" aria-label={name} className="text-lg">
			{icon || "📦"}
		</span>
	);
}

// ── Desktop: horizontal bar with mega-menu dropdowns ──

function DesktopCategoryBar({ tree }: { tree: CategoryNode[] }) {
	const [openId, setOpenId] = useState<string | null>(null);
	const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
	const barRef = useRef<HTMLDivElement>(null);

	const handleMouseEnter = useCallback((id: string) => {
		if (timeoutRef.current) clearTimeout(timeoutRef.current);
		setOpenId(id);
	}, []);

	const handleMouseLeave = useCallback(() => {
		timeoutRef.current = setTimeout(() => setOpenId(null), 200);
	}, []);

	useEffect(() => {
		return () => {
			if (timeoutRef.current) clearTimeout(timeoutRef.current);
		};
	}, []);

	return (
		<div
			ref={barRef}
			className="relative hidden border-[#E2E8F0] border-b bg-white lg:block"
		>
			<div className="container mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
				<nav className="flex items-center gap-0">
					{tree.map((parent) => (
						// biome-ignore lint/a11y/noStaticElementInteractions: hover menu
						<div
							key={parent.id}
							className="relative"
							onMouseEnter={() => handleMouseEnter(parent.id)}
							onMouseLeave={handleMouseLeave}
						>
							<Link
								href={`/search?category=${parent.id}`}
								className={`flex items-center gap-1.5 px-3 py-2.5 text-sm transition-colors ${
									openId === parent.id
										? "border-[#1E40AF] border-b-2 font-semibold text-[#1E40AF]"
										: "border-transparent border-b-2 text-[#475569] hover:text-[#0F172A]"
								}`}
							>
								<CategoryEmoji icon={parent.icon} name={parent.name} />
								<span className="whitespace-nowrap">{parent.name}</span>
								{parent.children.length > 0 && (
									<ChevronDown className="h-3.5 w-3.5 opacity-50" />
								)}
							</Link>

							{/* Mega menu */}
							{openId === parent.id && parent.children.length > 0 && (
								// biome-ignore lint/a11y/noStaticElementInteractions: hover menu
								<div
									className="absolute top-full left-0 z-50 min-w-[480px] rounded-b-xl border border-[#E2E8F0] border-t-0 bg-white p-5 shadow-lg"
									onMouseEnter={() => handleMouseEnter(parent.id)}
									onMouseLeave={handleMouseLeave}
								>
									<div className="mb-3 flex items-center justify-between">
										<Link
											href={`/search?category=${parent.id}`}
											className="font-bold text-[#0F172A] text-sm hover:text-[#1E40AF]"
										>
											All {parent.name}
										</Link>
									</div>
									<div
										className="grid gap-x-8 gap-y-1"
										style={{
											gridTemplateColumns: `repeat(${Math.min(parent.children.length, 3)}, minmax(0, 1fr))`,
										}}
									>
										{parent.children.map((child) => (
											<div key={child.id} className="min-w-[140px]">
												<Link
													href={`/search?category=${child.id}`}
													className="flex items-center gap-2 rounded-lg px-2 py-1.5 font-semibold text-[#0F172A] text-sm transition-colors hover:bg-[#F1F5F9] hover:text-[#1E40AF]"
												>
													<CategoryEmoji icon={child.icon} name={child.name} />
													{child.name}
												</Link>
												{child.children.length > 0 && (
													<div className="ml-2 border-[#E2E8F0] border-l pl-2">
														{child.children.map((grandchild) => (
															<Link
																key={grandchild.id}
																href={`/search?category=${grandchild.id}`}
																className="block rounded-md px-2 py-1 text-[#64748B] text-xs transition-colors hover:bg-[#F1F5F9] hover:text-[#1E40AF]"
															>
																{grandchild.name}
															</Link>
														))}
													</div>
												)}
											</div>
										))}
									</div>
								</div>
							)}
						</div>
					))}
				</nav>
			</div>
		</div>
	);
}

// ── Mobile: drill-down drawer ──

function MobileCategoryBar({ tree }: { tree: CategoryNode[] }) {
	const [open, setOpen] = useState(false);
	const [stack, setStack] = useState<CategoryNode[][]>([tree]);
	const [titles, setTitles] = useState<string[]>(["Categories"]);
	const [parentIds, setParentIds] = useState<string[]>([""]);

	function drillDown(node: CategoryNode) {
		if (node.children.length > 0) {
			setStack((s) => [...s, node.children]);
			setTitles((t) => [...t, node.name]);
			setParentIds((p) => [...p, node.id]);
		} else {
			setOpen(false);
		}
	}

	function goBack() {
		if (stack.length > 1) {
			setStack((s) => s.slice(0, -1));
			setTitles((t) => t.slice(0, -1));
			setParentIds((p) => p.slice(0, -1));
		}
	}

	function handleOpen() {
		setStack([tree]);
		setTitles(["Categories"]);
		setParentIds([""]);
		setOpen(true);
	}

	const currentItems = stack[stack.length - 1];
	const currentTitle = titles[titles.length - 1];
	const currentParentId = parentIds[parentIds.length - 1];
	const canGoBack = stack.length > 1;

	return (
		<div className="border-[#E2E8F0] border-b bg-white lg:hidden">
			<div className="container mx-auto max-w-7xl px-4">
				<button
					type="button"
					onClick={handleOpen}
					className="flex w-full items-center gap-2 py-2.5 text-[#475569] text-sm transition-colors hover:text-[#0F172A]"
				>
					<Grid3X3 className="h-4 w-4" />
					<span className="font-medium">Categories</span>
					<ChevronDown className="h-3.5 w-3.5 opacity-50" />
				</button>
			</div>

			{/* Overlay */}
			{open && (
				<div className="fixed inset-0 z-50 flex flex-col">
					{/* Backdrop */}
					{/* biome-ignore lint/a11y/noStaticElementInteractions: backdrop dismiss */}
					<div
						className="absolute inset-0 bg-black/40"
						onClick={() => setOpen(false)}
						onKeyDown={() => {
							/* dismiss on key */
						}}
					/>

					{/* Drawer */}
					<div className="relative mt-auto flex max-h-[75vh] animate-slide-up flex-col rounded-t-2xl bg-white shadow-2xl">
						{/* Header */}
						<div className="flex items-center justify-between border-[#E2E8F0] border-b px-4 py-3">
							<div className="flex items-center gap-2">
								{canGoBack && (
									<button
										type="button"
										onClick={goBack}
										className="flex h-8 w-8 items-center justify-center rounded-lg text-[#64748B] hover:bg-[#F1F5F9]"
									>
										<ChevronLeft className="h-5 w-5" />
									</button>
								)}
								<h3 className="font-semibold text-[#0F172A]">{currentTitle}</h3>
							</div>
							<button
								type="button"
								onClick={() => setOpen(false)}
								className="flex h-8 w-8 items-center justify-center rounded-lg text-[#64748B] hover:bg-[#F1F5F9]"
							>
								<X className="h-5 w-5" />
							</button>
						</div>

						{/* Items */}
						<div className="flex-1 overflow-y-auto p-2">
							{canGoBack && currentParentId && (
								<Link
									href={`/search?category=${currentParentId}`}
									onClick={() => setOpen(false)}
									className="mb-1 flex items-center gap-3 rounded-xl bg-[#F1F5F9] px-4 py-3 font-semibold text-[#1E40AF] text-sm"
								>
									See all in {currentTitle}
								</Link>
							)}
							{currentItems.map((node) => (
								<div key={node.id} className="flex items-center">
									<Link
										href={`/search?category=${node.id}`}
										onClick={() => setOpen(false)}
										className="flex flex-1 items-center gap-3 rounded-xl px-4 py-3 text-[#0F172A] text-sm transition-colors hover:bg-[#F1F5F9]"
									>
										<CategoryEmoji icon={node.icon} name={node.name} />
										<span className="font-medium">{node.name}</span>
									</Link>
									{node.children.length > 0 && (
										<button
											type="button"
											onClick={() => drillDown(node)}
											className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-[#94A3B8] hover:bg-[#F1F5F9] hover:text-[#0F172A]"
										>
											<ChevronDown className="-rotate-90 h-4 w-4" />
										</button>
									)}
								</div>
							))}
						</div>
					</div>
				</div>
			)}
		</div>
	);
}

// ── Main export ──

interface CategoryBarProps {
	categories: Category[];
}

export function CategoryBar({ categories }: CategoryBarProps) {
	const tree = buildTree(categories);
	if (tree.length === 0) return null;

	return (
		<>
			<DesktopCategoryBar tree={tree} />
			<MobileCategoryBar tree={tree} />
		</>
	);
}
