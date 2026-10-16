import { ChevronLeft, ChevronRight } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { SHOPS_DIRECTORY } from "~/lib/nav";
import { serverGet } from "~/lib/server-api";
import { getShopsEnabled } from "~/lib/server-shop";
import {
	type DirectoryFilters,
	directoryApiQuery,
	directoryHref,
	pageCount,
	pageWindow,
	parseDirectoryParams,
} from "~/lib/shop-directory";
import { cn } from "~/lib/utils";
import type { Category, ShopSearchResponse } from "~/types";
import { ShopResultRow } from "../search/shop-result-row";
import { DirectoryFiltersBar } from "./directory-filters";

const WEB_URL = process.env.NEXT_PUBLIC_WEB_URL ?? "https://buynsellem.com";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export async function generateMetadata({
	searchParams,
}: {
	searchParams: SearchParams;
}): Promise<Metadata> {
	const t = await getTranslations("ShopDirectory");
	const { city } = parseDirectoryParams(await searchParams);
	return {
		title: city ? t("metaTitleIn", { city }) : t("metaTitle"),
		description: t("metaDescription"),
		alternates: { canonical: `${WEB_URL}${SHOPS_DIRECTORY}` },
	};
}

async function getCategories(): Promise<{ id: string; name: string }[]> {
	const data = await serverGet<{ categories?: Category[] }>(
		"/api/public/categories",
	);
	return (data?.categories ?? [])
		.filter((category) => !category.parent)
		.map((category) => ({ id: String(category.id), name: category.name }));
}

function Pager({
	filters,
	pages,
	label,
	previous,
	next,
}: {
	filters: DirectoryFilters;
	pages: number;
	label: string;
	previous: string;
	next: string;
}) {
	if (pages <= 1) return null;
	const current = Math.min(filters.page, pages);
	const linkClass =
		"flex h-10 min-w-10 items-center justify-center rounded-lg border px-3 font-semibold text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/30";
	return (
		<nav aria-label={label} className="flex flex-wrap justify-center gap-2">
			{current > 1 && (
				<Link
					href={directoryHref({ ...filters, page: current - 1 })}
					className={cn(linkClass, "border-line bg-surface text-ink")}
					aria-label={previous}
				>
					<ChevronLeft className="h-4 w-4" />
				</Link>
			)}
			{pageWindow(current, pages).map((page) => (
				<Link
					key={page}
					href={directoryHref({ ...filters, page })}
					aria-current={page === current ? "page" : undefined}
					className={cn(
						linkClass,
						page === current
							? "border-brand bg-brand text-white"
							: "border-line bg-surface text-ink hover:border-ink-faint",
					)}
				>
					{page}
				</Link>
			))}
			{current < pages && (
				<Link
					href={directoryHref({ ...filters, page: current + 1 })}
					className={cn(linkClass, "border-line bg-surface text-ink")}
					aria-label={next}
				>
					<ChevronRight className="h-4 w-4" />
				</Link>
			)}
		</nav>
	);
}

export default async function ShopDirectoryPage({
	searchParams,
}: {
	searchParams: SearchParams;
}) {
	if (!(await getShopsEnabled())) notFound();
	const t = await getTranslations("ShopDirectory");
	const filters = parseDirectoryParams(await searchParams);
	const [categories, result] = await Promise.all([
		getCategories(),
		serverGet<ShopSearchResponse>(
			`/api/public/search/shops?${directoryApiQuery(filters)}`,
		),
	]);
	const hits = result?.hits ?? [];
	const sponsored = result?.sponsored ?? [];
	const total = result?.total ?? 0;
	const filtered = Boolean(
		filters.q || filters.city || filters.level || filters.category,
	);

	return (
		<div className="container mx-auto max-w-4xl space-y-5 px-4 py-6 sm:px-6 lg:px-8">
			<header className="space-y-1">
				<h1 className="font-bold font-heading text-2xl text-ink sm:text-3xl">
					{t("title")}
				</h1>
				<p className="text-ink-muted text-sm">{t("subtitle")}</p>
			</header>

			<DirectoryFiltersBar filters={filters} categories={categories} />

			{result === null ? (
				<div className="rounded-xl border border-bad-line bg-bad-faint p-6 text-center text-bad-ink text-sm">
					{t("loadError")}
				</div>
			) : (
				<>
					{sponsored.length > 0 && (
						<section
							aria-labelledby="directory-sponsored"
							className="space-y-2"
						>
							<h2
								id="directory-sponsored"
								className="font-semibold text-ink-mid text-xs"
							>
								{t("sponsoredHeading")}
							</h2>
							<div className="overflow-hidden rounded-xl border border-line bg-surface">
								{sponsored.map((shop) => (
									<ShopResultRow
										key={shop.id}
										shop={shop}
										query={filters.q}
										sponsored
									/>
								))}
							</div>
						</section>
					)}

					<p className="text-[13px] text-ink-muted" aria-live="polite">
						{filters.city
							? t("countIn", { count: total, city: filters.city })
							: t("count", { count: total })}
					</p>

					{hits.length === 0 ? (
						sponsored.length === 0 && (
							<div className="rounded-xl border border-line border-dashed bg-surface p-10 text-center">
								<p className="font-semibold text-ink">{t("emptyTitle")}</p>
								<p className="mt-1 text-ink-muted text-sm">
									{filtered ? t("emptyFiltered") : t("emptyBody")}
								</p>
								{filtered && (
									<Link
										href={SHOPS_DIRECTORY}
										className="mt-4 inline-flex h-10 items-center rounded-lg border border-line px-4 font-semibold text-sm"
									>
										{t("clearFilters")}
									</Link>
								)}
							</div>
						)
					) : (
						<div className="overflow-hidden rounded-xl border border-line bg-surface">
							{hits.map((shop) => (
								<ShopResultRow key={shop.id} shop={shop} query={filters.q} />
							))}
						</div>
					)}

					<Pager
						filters={filters}
						pages={pageCount(total)}
						label={t("pagination")}
						previous={t("previous")}
						next={t("next")}
					/>
				</>
			)}
		</div>
	);
}
