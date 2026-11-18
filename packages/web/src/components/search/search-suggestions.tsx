"use client";

import { useQuery } from "@tanstack/react-query";
import { Clock, LayoutGrid, Search, Store, X } from "lucide-react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import {
	type KeyboardEvent,
	type ReactNode,
	useId,
	useMemo,
	useState,
} from "react";
import { useDebouncedValue } from "~/hooks/use-debounced-value";
import { useNavCategories } from "~/hooks/use-nav-categories";
import { useRecentSearches } from "~/hooks/use-recent-searches";
import { cn } from "~/lib/utils";
import type { ShopSearchResponse } from "~/types/shop";
import {
	matchCategories,
	SHOP_SUGGESTIONS_MAX,
	SUGGEST_MIN_CHARS,
} from "../../../../api/src/contracts/searchSuggest";

type Suggestion =
	| { kind: "query"; key: string; label: string }
	| { kind: "recent"; key: string; label: string }
	| { kind: "category"; key: string; label: string; id: string }
	| {
			kind: "shop";
			key: string;
			label: string;
			handle: string;
			city: string | null;
			logoUrl: string | null;
	  };

const SHOP_DEBOUNCE_MS = 250;

function searchUrl(params: Record<string, string | null | undefined>): string {
	const query = new URLSearchParams();
	for (const [key, value] of Object.entries(params)) {
		if (value) query.set(key, value);
	}
	const qs = query.toString();
	return qs ? `/search?${qs}` : "/search";
}

/**
 * The suggestion list under a search box. Focused and empty, it offers the
 * buyer's recent searches; typing, it offers to run the search, then the
 * matching categories and shops, so "frigo" can go straight to the Fridges
 * category or a shop called Frigo Plus. A pick from the list is remembered
 * like a typed search.
 *
 * The box keeps its own markup: this hook hands back the props its input
 * needs (combobox semantics, arrow keys, Escape) and the panel to render
 * right after it, inside a `relative` wrapper.
 */
export function useSearchSuggestions({
	query,
	city,
	onSearch,
	enabled = true,
}: {
	query: string;
	city?: string | null;
	/** Runs a text search; the box's own submit goes through `submit`. */
	onSearch: (query: string) => void;
	enabled?: boolean;
}): {
	inputProps: {
		role: "combobox";
		"aria-expanded": boolean;
		"aria-controls": string;
		"aria-autocomplete": "list";
		"aria-activedescendant": string | undefined;
		autoComplete: "off";
		onFocus: () => void;
		onBlur: () => void;
		onKeyDown: (event: KeyboardEvent<HTMLInputElement>) => void;
	};
	submit: () => void;
	panel: ReactNode;
} {
	const t = useTranslations("SearchSuggest");
	const router = useRouter();
	const listId = useId();
	const [focused, setFocused] = useState(false);
	const [dismissed, setDismissed] = useState(false);
	const [active, setActive] = useState(-1);
	const { recent, remember, remove, clear } = useRecentSearches();
	const typed = query.trim();
	const typing = typed.length >= SUGGEST_MIN_CHARS;
	const categories = useNavCategories(undefined, enabled && focused && typing);
	const debounced = useDebouncedValue(typed, SHOP_DEBOUNCE_MS);

	const shops = useQuery({
		queryKey: ["search-suggest", "shops", debounced],
		queryFn: async ({ signal }) => {
			const params = new URLSearchParams({
				q: debounced,
				limit: String(SHOP_SUGGESTIONS_MAX),
			});
			const res = await fetch(`/api/public/search/shops?${params}`, {
				signal,
			});
			if (!res.ok) throw new Error(`shops ${res.status}`);
			return (await res.json()) as ShopSearchResponse;
		},
		enabled: enabled && focused && debounced.length >= SUGGEST_MIN_CHARS,
		staleTime: 60_000,
	});

	const items = useMemo<Suggestion[]>(() => {
		if (!typing) {
			return recent.map((label) => ({
				kind: "recent",
				key: `recent:${label}`,
				label,
			}));
		}
		const shopHits =
			debounced === typed
				? (shops.data?.hits ?? []).slice(0, SHOP_SUGGESTIONS_MAX)
				: [];
		return [
			{ kind: "query", key: "query", label: typed },
			...matchCategories(categories, typed).map(
				(category): Suggestion => ({
					kind: "category",
					key: `category:${category.id}`,
					label: category.name,
					id: category.id,
				}),
			),
			...shopHits.map(
				(shop): Suggestion => ({
					kind: "shop",
					key: `shop:${shop.id}`,
					label: shop.name,
					handle: shop.handle,
					city: shop.city,
					logoUrl: shop.logoUrl,
				}),
			),
		];
	}, [typing, typed, debounced, recent, categories, shops.data]);

	// A new list starts with nothing highlighted (adjusted during render, so
	// the stale highlight never paints).
	const itemsKey = items.map((item) => item.key).join("|");
	const [highlightFor, setHighlightFor] = useState(itemsKey);
	if (highlightFor !== itemsKey) {
		setHighlightFor(itemsKey);
		setActive(-1);
	}

	const open = enabled && focused && !dismissed && items.length > 0;

	const close = () => {
		setDismissed(true);
		setActive(-1);
	};

	const pick = (item: Suggestion) => {
		close();
		switch (item.kind) {
			case "query":
			case "recent":
				remember(item.label);
				onSearch(item.label);
				return;
			case "category":
				remember(typed);
				router.push(searchUrl({ category: item.id, location: city }));
				return;
			case "shop":
				remember(typed);
				router.push(`/s/${encodeURIComponent(item.handle)}`);
				return;
		}
	};

	const submit = () => {
		const highlighted = open && active >= 0 ? items[active] : undefined;
		if (highlighted) {
			pick(highlighted);
			return;
		}
		close();
		remember(typed);
		onSearch(typed);
	};

	const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
		if (event.key === "Escape") {
			close();
			return;
		}
		if (event.key !== "ArrowDown" && event.key !== "ArrowUp") {
			setDismissed(false);
			return;
		}
		event.preventDefault();
		setDismissed(false);
		if (items.length === 0) return;
		setActive((current) =>
			event.key === "ArrowDown"
				? (current + 1) % items.length
				: current <= 0
					? items.length - 1
					: current - 1,
		);
	};

	const optionId = (index: number) => `${listId}-${index}`;

	const panel = open ? (
		<div className="absolute top-full right-0 left-0 z-50 mt-2 overflow-hidden rounded-2xl border border-line bg-surface text-left shadow-[0_18px_40px_-18px_rgba(15,23,42,0.35)] sm:min-w-[22rem]">
			{!typing && (
				<div className="flex items-center justify-between px-4 pt-3 pb-1">
					<p className="font-semibold text-[11px] text-ink-muted uppercase tracking-wide">
						{t("recent")}
					</p>
					<button
						type="button"
						onMouseDown={(event) => event.preventDefault()}
						onClick={clear}
						className="font-medium text-brand text-xs hover:underline"
					>
						{t("clearRecent")}
					</button>
				</div>
			)}
			<div id={listId} role="listbox" className="max-h-96 overflow-y-auto py-1">
				{items.map((item, index) => (
					<div
						key={item.key}
						id={optionId(index)}
						role="option"
						// Focus stays in the input (aria-activedescendant); -1 keeps
						// the option reachable for assistive tech without a tab stop.
						tabIndex={-1}
						aria-selected={index === active}
						onKeyDown={(event) => {
							if (event.key === "Enter") pick(item);
						}}
						// Keeps the input focused, so the click lands before blur closes the list.
						onMouseDown={(event) => event.preventDefault()}
						onClick={() => pick(item)}
						onMouseEnter={() => setActive(index)}
						className={cn(
							"group flex cursor-pointer items-center gap-3 px-4 py-2 text-ink text-sm",
							index === active && "bg-subtle",
						)}
					>
						<SuggestionIcon item={item} />
						<span className="min-w-0 flex-1 truncate">
							{item.kind === "query" ? (
								t("searchFor", { query: item.label })
							) : item.kind === "category" ? (
								<>
									{item.label}
									<span className="ml-2 text-ink-muted text-xs">
										{t("category")}
									</span>
								</>
							) : item.kind === "shop" ? (
								<>
									{item.label}
									<span className="ml-2 text-ink-muted text-xs">
										{item.city ? t("shopIn", { city: item.city }) : t("shop")}
									</span>
								</>
							) : (
								item.label
							)}
						</span>
						{item.kind === "recent" && (
							<button
								type="button"
								aria-label={t("removeRecent", { query: item.label })}
								onMouseDown={(event) => event.preventDefault()}
								onClick={(event) => {
									event.stopPropagation();
									remove(item.label);
								}}
								className="rounded-full p-1 text-ink-faint opacity-0 transition-opacity hover:bg-line hover:text-ink-soft focus-visible:opacity-100 group-hover:opacity-100"
							>
								<X aria-hidden="true" className="h-3.5 w-3.5" />
							</button>
						)}
					</div>
				))}
			</div>
		</div>
	) : null;

	return {
		inputProps: {
			role: "combobox",
			"aria-expanded": open,
			"aria-controls": listId,
			"aria-autocomplete": "list",
			"aria-activedescendant":
				open && active >= 0 ? optionId(active) : undefined,
			autoComplete: "off",
			onFocus: () => {
				setFocused(true);
				setDismissed(false);
			},
			onBlur: () => {
				setFocused(false);
				setActive(-1);
			},
			onKeyDown,
		},
		submit,
		panel,
	};
}

function SuggestionIcon({ item }: { item: Suggestion }) {
	const box =
		"flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-subtle text-ink-muted";
	switch (item.kind) {
		case "recent":
			return (
				<span className={box}>
					<Clock aria-hidden="true" className="h-4 w-4" />
				</span>
			);
		case "query":
			return (
				<span className={cn(box, "bg-brand-soft text-brand")}>
					<Search aria-hidden="true" className="h-4 w-4" />
				</span>
			);
		case "category":
			return (
				<span className={box}>
					<LayoutGrid aria-hidden="true" className="h-4 w-4" />
				</span>
			);
		case "shop":
			return item.logoUrl ? (
				<Image
					src={item.logoUrl}
					alt=""
					width={32}
					height={32}
					className="h-8 w-8 shrink-0 rounded-lg object-cover"
				/>
			) : (
				<span className={box}>
					<Store aria-hidden="true" className="h-4 w-4" />
				</span>
			);
	}
}
