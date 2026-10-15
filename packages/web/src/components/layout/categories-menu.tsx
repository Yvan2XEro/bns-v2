"use client";

import { useQuery } from "@tanstack/react-query";
import { ChevronDown, ChevronRight, LayoutGrid } from "lucide-react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import {
	type KeyboardEvent,
	type PointerEvent,
	useCallback,
	useEffect,
	useId,
	useReducer,
	useRef,
} from "react";
import { CategoryIcon } from "~/components/category-icon";
import { shopSearchKey } from "~/hooks/use-shop-search";
import {
	AIM_DELAY,
	aimsAtPane,
	categoryHref,
	HOVER_CLOSE_DELAY,
	HOVER_OPEN_DELAY,
	type MegaFocus,
	megaMenuKey,
	megaMenuReducer,
	type NavRubric,
	type Point,
	shopsDirectoryHref,
} from "~/lib/nav";
import { shopApi } from "~/lib/shop-api";
import { cn } from "~/lib/utils";

interface CategoriesMenuProps {
	rubrics: NavRubric[];
	/** The remembered browsing city, for the shops line. */
	city: string | null;
	shopsEnabled: boolean;
	/** Shop mode paints the trigger with the shop's colours. */
	themed?: boolean;
	/** Starts open: for tests and static previews. */
	defaultOpen?: boolean;
	/** Asks the caller for the tree the first time the menu is wanted. */
	onWanted?: () => void;
}

type TimerRef = { current: ReturnType<typeof setTimeout> | null };

function clearTimer(timer: TimerRef) {
	if (timer.current) clearTimeout(timer.current);
	timer.current = null;
}

/**
 * "Toutes les catégories": a two-pane disclosure (rubrics left, the active
 * rubric's sub-categories right). Opens on click, or on a 0.5 s hover with a
 * diagonal tolerance toward the pane; Escape and an outside click close it.
 */
export function CategoriesMenu({
	rubrics,
	city,
	shopsEnabled,
	themed = false,
	defaultOpen = false,
	onWanted,
}: CategoriesMenuProps) {
	const t = useTranslations("Nav");
	const panelId = useId();
	const [{ open, active }, dispatch] = useReducer(megaMenuReducer, {
		open: defaultOpen,
		active: 0,
	});
	const rootRef = useRef<HTMLDivElement>(null);
	const triggerRef = useRef<HTMLButtonElement>(null);
	const paneRef = useRef<HTMLDivElement>(null);
	const rubricRefs = useRef<Array<HTMLAnchorElement | null>>([]);
	const hoverTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
	const aimTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
	const lastPoint = useRef<Point | null>(null);
	const pendingFocus = useRef<MegaFocus | null>(null);

	const close = useCallback((returnFocus: boolean) => {
		dispatch({ type: "close" });
		if (returnFocus) triggerRef.current?.focus();
	}, []);

	useEffect(() => {
		if (open) onWanted?.();
	}, [open, onWanted]);

	useEffect(
		() => () => {
			clearTimer(hoverTimer);
			clearTimer(aimTimer);
		},
		[],
	);

	useEffect(() => {
		if (!open) return;
		const onPointerDown = (event: globalThis.PointerEvent) => {
			if (!rootRef.current?.contains(event.target as Node)) close(false);
		};
		const onKeyDown = (event: globalThis.KeyboardEvent) => {
			if (event.key !== "Escape") return;
			const inside = rootRef.current?.contains(document.activeElement);
			close(Boolean(inside));
		};
		document.addEventListener("pointerdown", onPointerDown);
		document.addEventListener("keydown", onKeyDown);
		return () => {
			document.removeEventListener("pointerdown", onPointerDown);
			document.removeEventListener("keydown", onKeyDown);
		};
	}, [open, close]);

	const paneLinks = () =>
		Array.from(paneRef.current?.querySelectorAll<HTMLAnchorElement>("a") ?? []);

	const applyFocus = useCallback((focus: MegaFocus) => {
		if (focus.pane === "rubrics") {
			dispatch({ type: "activate", index: focus.rubric });
			rubricRefs.current[focus.rubric]?.focus();
			return;
		}
		paneRef.current
			?.querySelectorAll<HTMLAnchorElement>("a")
			[focus.child]?.focus();
	}, []);

	// The panel mounts on open: focus can only move once it is there.
	useEffect(() => {
		if (open && pendingFocus.current) {
			applyFocus(pendingFocus.current);
			pendingFocus.current = null;
		}
	}, [open, applyFocus]);

	const rubricCount = rubrics.length;

	const onTriggerClick = (event: React.MouseEvent) => {
		clearTimer(hoverTimer);
		// A keyboard "click" (Enter / Space) lands on the first rubric.
		if (!open && event.detail === 0) {
			pendingFocus.current = { pane: "rubrics", rubric: 0, child: 0 };
		}
		dispatch({ type: "toggle" });
	};

	const onTriggerKeyDown = (event: KeyboardEvent) => {
		if (event.key !== "ArrowDown") return;
		event.preventDefault();
		const focus: MegaFocus = { pane: "rubrics", rubric: 0, child: 0 };
		if (open) applyFocus(focus);
		else {
			pendingFocus.current = focus;
			dispatch({ type: "open" });
		}
	};

	const onPanelKeyDown = (event: KeyboardEvent) => {
		const target = event.target as HTMLElement;
		const rubric = rubricRefs.current.indexOf(target as HTMLAnchorElement);
		const links = paneLinks();
		const child = links.indexOf(target as HTMLAnchorElement);
		if (rubric < 0 && child < 0) return;
		const focus: MegaFocus =
			rubric >= 0
				? { pane: "rubrics", rubric, child: 0 }
				: { pane: "children", rubric: active, child };
		const result = megaMenuKey(focus, event.key, {
			rubrics: rubricCount,
			children: links.length,
		});
		if (!result) return;
		event.preventDefault();
		if (result.kind === "close") close(true);
		else applyFocus(result.focus);
	};

	const onRootPointerEnter = (event: PointerEvent) => {
		if (event.pointerType !== "mouse") return;
		clearTimer(hoverTimer);
		if (!open)
			hoverTimer.current = setTimeout(
				() => dispatch({ type: "open" }),
				HOVER_OPEN_DELAY,
			);
	};

	const onRootPointerLeave = (event: PointerEvent) => {
		if (event.pointerType !== "mouse") return;
		clearTimer(hoverTimer);
		clearTimer(aimTimer);
		if (open)
			hoverTimer.current = setTimeout(
				() => dispatch({ type: "close" }),
				HOVER_CLOSE_DELAY,
			);
	};

	const onRubricPointer = (index: number, event: PointerEvent) => {
		if (event.pointerType !== "mouse") return;
		const point = { x: event.clientX, y: event.clientY };
		const from = lastPoint.current;
		lastPoint.current = point;
		if (index === active) {
			clearTimer(aimTimer);
			return;
		}
		const rect = paneRef.current?.getBoundingClientRect();
		clearTimer(aimTimer);
		if (from && rect && aimsAtPane(from, point, rect)) {
			aimTimer.current = setTimeout(
				() => dispatch({ type: "activate", index }),
				AIM_DELAY,
			);
		} else {
			dispatch({ type: "activate", index });
		}
	};

	const current = rubrics[active];

	return (
		<div
			ref={rootRef}
			onPointerEnter={onRootPointerEnter}
			onPointerLeave={onRootPointerLeave}
		>
			<button
				ref={triggerRef}
				type="button"
				aria-expanded={open}
				aria-controls={panelId}
				onClick={onTriggerClick}
				onKeyDown={onTriggerKeyDown}
				className={cn(
					"flex h-10 shrink-0 items-center gap-1.5 rounded-lg border px-3 font-semibold text-sm transition-colors focus-visible:outline-none focus-visible:ring-2",
					themed
						? open
							? "border-transparent bg-[var(--shop-head-accent)] text-[var(--shop-head-on-accent)] focus-visible:ring-[var(--shop-head-fg)]"
							: "border-white/25 text-[var(--shop-head-fg)] hover:bg-white/10 focus-visible:ring-[var(--shop-head-fg)]"
						: open
							? "border-[#1E40AF] bg-[#EFF6FF] text-[#1E40AF] focus-visible:ring-[#93C5FD]"
							: "border-[#E2E8F0] bg-white text-[#0F172A] hover:border-[#94A3B8] focus-visible:ring-[#93C5FD]",
				)}
			>
				<LayoutGrid aria-hidden="true" className="h-4 w-4" />
				<span className="sr-only lg:not-sr-only">{t("allCategories")}</span>
				<ChevronDown
					aria-hidden="true"
					className={cn("h-4 w-4 transition-transform", open && "rotate-180")}
				/>
			</button>

			{open && (
				// biome-ignore lint/a11y/noStaticElementInteractions: arrow-key roving across the links inside
				<div
					id={panelId}
					onKeyDown={onPanelKeyDown}
					className="absolute inset-x-0 top-full z-50 border-[#E2E8F0] border-y bg-white text-[#0F172A] shadow-[0_12px_24px_rgba(15,23,42,0.08)]"
				>
					<nav
						aria-label={t("allCategories")}
						className="container mx-auto grid max-w-7xl grid-cols-[15rem_1fr] px-4 sm:px-6 lg:px-8"
					>
						<ul className="max-h-[70vh] overflow-y-auto py-2 pr-2">
							{rubrics.length === 0 && (
								<li className="px-3 py-2 text-[#64748B] text-sm">
									{t("loading")}
								</li>
							)}
							{rubrics.map((rubric, index) => (
								<li key={rubric.id}>
									<Link
										ref={(node) => {
											rubricRefs.current[index] = node;
										}}
										href={categoryHref(rubric.id)}
										onPointerMove={(event) => onRubricPointer(index, event)}
										onFocus={() => dispatch({ type: "activate", index })}
										onClick={() => close(false)}
										aria-current={index === active ? "true" : undefined}
										className={cn(
											"flex items-center justify-between rounded-lg px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#93C5FD]",
											index === active
												? "bg-[#EFF6FF] font-semibold text-[#1E40AF]"
												: "text-[#0F172A] hover:bg-[#F8FAFC]",
										)}
									>
										<span className="flex min-w-0 items-center gap-2.5">
											<CategoryIcon
												category={rubric}
												imageUrl={rubric.imageUrl}
												size={28}
												decorative
												className="shrink-0"
											/>
											<span className="truncate">{rubric.name}</span>
										</span>
										<ChevronRight
											aria-hidden="true"
											className="h-4 w-4 text-[#94A3B8]"
										/>
									</Link>
								</li>
							))}
							{shopsEnabled && (
								<li className="mt-1 border-[#E2E8F0] border-t pt-1">
									<Link
										href={shopsDirectoryHref({})}
										onClick={() => close(false)}
										className="flex items-center justify-between rounded-lg px-3 py-2 font-semibold text-[#0F172A] text-sm hover:bg-[#F8FAFC] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#93C5FD]"
									>
										{t("shops")}
										<ChevronRight
											aria-hidden="true"
											className="h-4 w-4 text-[#94A3B8]"
										/>
									</Link>
								</li>
							)}
						</ul>

						<div
							ref={paneRef}
							className="min-h-48 border-[#E2E8F0] border-l px-6 py-4"
						>
							{current && (
								<>
									<h2 className="mb-2 font-bold font-heading text-[#0F172A] text-base">
										{current.name}
									</h2>
									{current.children.length > 0 && (
										<ul className="grid grid-cols-2 gap-x-6 gap-y-0.5 lg:grid-cols-3">
											{current.children.map((child) => (
												<li key={child.id}>
													<Link
														href={categoryHref(child.id)}
														onClick={() => close(false)}
														className="flex items-center gap-2 rounded px-1 py-1.5 text-[#334155] text-sm hover:text-[#1E40AF] hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#93C5FD]"
													>
														<CategoryIcon
															category={child}
															imageUrl={child.imageUrl}
															size={22}
															decorative
															className="shrink-0"
														/>
														{child.name}
													</Link>
												</li>
											))}
										</ul>
									)}
									<Link
										href={categoryHref(current.id)}
										onClick={() => close(false)}
										className="mt-3 inline-flex items-center gap-1 rounded px-1 font-semibold text-[#1E40AF] text-sm hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#93C5FD]"
									>
										{t("allOf", { name: current.name })}
										<ChevronRight aria-hidden="true" className="h-4 w-4" />
									</Link>
									{shopsEnabled && (
										<RubricShops
											rubric={current}
											city={city}
											onNavigate={() => close(false)}
										/>
									)}
								</>
							)}
						</div>
					</nav>
				</div>
			)}
		</div>
	);
}

/** "Boutiques Électronique à Douala : A, B, C": three names, no images. */
function RubricShops({
	rubric,
	city,
	onNavigate,
}: {
	rubric: NavRubric;
	city: string | null;
	onNavigate: () => void;
}) {
	const t = useTranslations("Nav");
	const params = { q: "", city: city ?? "", category: rubric.id, limit: 3 };
	const shops = useQuery({
		queryKey: shopSearchKey(params),
		queryFn: () =>
			shopApi.searchShops({
				category: rubric.id,
				city: city ?? undefined,
				limit: 3,
			}),
		retry: false,
		staleTime: 5 * 60_000,
	});
	const hits = (shops.data?.hits ?? []).slice(0, 3);

	return (
		<p className="mt-4 border-[#E2E8F0] border-t pt-3 text-[#475569] text-sm">
			<Link
				href={shopsDirectoryHref({ category: rubric.id, city })}
				onClick={onNavigate}
				className="rounded px-1 font-semibold text-[#0F172A] hover:text-[#1E40AF] hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#93C5FD]"
			>
				{city
					? t("shopsOfIn", { name: rubric.name, city })
					: t("shopsOf", { name: rubric.name })}
			</Link>
			{hits.length > 0 && (
				<>
					<span aria-hidden="true">{" : "}</span>
					{hits.map((shop, index) => (
						<span key={shop.id}>
							{index > 0 && ", "}
							<Link
								href={`/s/${shop.handle}`}
								onClick={onNavigate}
								className="rounded px-0.5 hover:text-[#1E40AF] hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#93C5FD]"
							>
								{shop.name}
							</Link>
						</span>
					))}
				</>
			)}
		</p>
	);
}
