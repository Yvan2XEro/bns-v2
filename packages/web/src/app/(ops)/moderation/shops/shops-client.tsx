"use client";

import { Search } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { useEffect, useRef, useState } from "react";
import {
	ListEmpty,
	ListError,
	ListLoading,
	LoadMore,
} from "~/components/moderation/console-parts";
import {
	ConsoleHeader,
	FilterChip,
} from "~/components/moderation/master-detail";
import { ShopsTable } from "~/components/moderation/shops-table";
import { useDebouncedValue } from "~/hooks/use-debounced-value";
import { useModerationShops } from "~/hooks/use-moderation-shops";
import {
	parseShopFilters,
	SHOP_STATUS_LABELS,
	shopSheetHref,
	shopsHref,
} from "~/lib/moderation-shops";
import { MODERATION_SHOP_STATUSES } from "../../../../../../api/src/contracts/moderationConsole";

export function ShopsClient() {
	const t = useTranslations("ModerationConsole");
	const pathname = usePathname();
	const router = useRouter();
	const params = useSearchParams();
	const filters = parseShopFilters(params);
	const [text, setText] = useState(filters.q ?? "");
	const debounced = useDebouncedValue(text.trim(), 300);
	const shops = useModerationShops(filters);
	const items = shops.data?.pages.flatMap((page) => page.items) ?? [];

	const urlQ = filters.q ?? "";
	const status = filters.status;
	const pushed = useRef(debounced);

	// Typing writes `?q=` once the input settles; a URL changed from elsewhere
	// (back, a link) rewrites the input instead of being overwritten by it.
	useEffect(() => {
		if (debounced === pushed.current) return;
		pushed.current = debounced;
		if (debounced === urlQ) return;
		router.replace(shopsHref(pathname, { q: debounced || undefined, status }), {
			scroll: false,
		});
	}, [debounced, urlQ, status, pathname, router]);

	useEffect(() => {
		if (urlQ !== pushed.current) {
			pushed.current = urlQ;
			setText(urlQ);
		}
	}, [urlQ]);

	return (
		<div className="space-y-5">
			<ConsoleHeader title={t("shops.title")} subtitle={t("shops.subtitle")} />
			<div className="flex flex-col gap-3 md:flex-row md:items-center">
				<div className="relative md:w-80">
					<label htmlFor="shops-search" className="sr-only">
						{t("shops.searchLabel")}
					</label>
					<Search
						aria-hidden="true"
						className="-translate-y-1/2 pointer-events-none absolute top-1/2 left-3 h-4 w-4 text-ink-muted"
					/>
					<input
						id="shops-search"
						type="search"
						value={text}
						maxLength={100}
						onChange={(event) => setText(event.target.value)}
						placeholder={t("shops.searchPlaceholder")}
						className="h-10 w-full rounded-lg border border-line bg-surface pr-3 pl-9 text-ink text-sm placeholder:text-ink-ghost focus-visible:border-brand focus-visible:outline-2 focus-visible:outline-brand"
					/>
				</div>
				<nav
					aria-label={t("shops.statusLabel")}
					className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:flex-wrap sm:px-0 md:pb-0"
				>
					<FilterChip
						href={shopsHref(pathname, { q: filters.q })}
						active={!filters.status}
					>
						{t("shops.allStatuses")}
					</FilterChip>
					{MODERATION_SHOP_STATUSES.map((status) => (
						<FilterChip
							key={status}
							href={shopsHref(pathname, { q: filters.q, status })}
							active={filters.status === status}
						>
							{t(SHOP_STATUS_LABELS[status])}
						</FilterChip>
					))}
				</nav>
			</div>
			{shops.isPending ? (
				<ListLoading label={t("shops.loading")} />
			) : shops.isError ? (
				<ListError
					error={shops.error}
					fallback={t("shops.loadError")}
					onRetry={() => void shops.refetch()}
				/>
			) : items.length === 0 ? (
				<ListEmpty>
					{filters.q || filters.status
						? t("shops.emptyFiltered")
						: t("shops.empty")}
				</ListEmpty>
			) : (
				<div className="space-y-3">
					<ShopsTable
						shops={items}
						onOpen={(id) => router.push(shopSheetHref(id))}
					/>
					{shops.hasNextPage ? (
						<LoadMore
							onClick={() => void shops.fetchNextPage()}
							loading={shops.isFetchingNextPage}
						/>
					) : null}
				</div>
			)}
		</div>
	);
}
