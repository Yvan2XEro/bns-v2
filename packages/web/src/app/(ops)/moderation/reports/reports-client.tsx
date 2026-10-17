"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import {
	ListEmpty,
	ListError,
	ListLoading,
	LoadMore,
} from "~/components/moderation/console-parts";
import { ListingPanel } from "~/components/moderation/listing-panel";
import {
	ConsoleHeader,
	DetailNotFound,
	FilterChip,
	MasterDetail,
} from "~/components/moderation/master-detail";
import { ReportPanel } from "~/components/moderation/report-panel";
import {
	PendingListingsTable,
	ReportsTable,
} from "~/components/moderation/reports-table";
import { useModerationSummary } from "~/hooks/use-moderation-console";
import {
	usePendingListings,
	useReportsList,
} from "~/hooks/use-moderation-reports";
import { useUrlSelection } from "~/hooks/use-url-selection";
import {
	REPORT_REASON_LABELS,
	selectionParam,
	TARGET_TYPE_LABELS,
} from "~/lib/moderation-console";
import {
	isReportReason,
	isReportTargetType,
	nextAfter,
	parseReportFilters,
	parseReportsTab,
	REPORT_STATUS_LABELS,
	REPORT_STATUSES,
	REPORT_TARGET_TYPES,
	type ReportFilters,
	reportsHref,
} from "~/lib/moderation-reports";
import { query } from "~/lib/shop-api";

const SELECT =
	"h-8 rounded-full border border-line bg-surface px-3 font-medium text-[13px] text-ink-soft focus-visible:outline-2 focus-visible:outline-brand focus-visible:outline-offset-2";

export function ReportsClient() {
	const t = useTranslations("ModerationConsole");
	const pathname = usePathname();
	const router = useRouter();
	const params = useSearchParams();
	const { selection, select, hrefFor } = useUrlSelection();
	const tab = parseReportsTab(params, selection);
	const filters = parseReportFilters(params);
	const summary = useModerationSummary();
	const reports = useReportsList(filters);
	const listings = usePendingListings();

	const reportItems = reports.data?.pages.flatMap((page) => page.docs) ?? [];
	const listingItems = listings.data?.pages.flatMap((page) => page.docs) ?? [];

	const listingHref = (id: string) =>
		`${pathname}${query({ tab: "listings", item: selectionParam({ type: "listing", id }) })}`;

	/** Advance to the item that followed the decided one, or close the panel. */
	const onDecided = (type: "report" | "listing", id: string) => {
		const ids =
			type === "report"
				? reportItems.map((report) => report.id)
				: listingItems.map((listing) => listing.id);
		const next = nextAfter(ids, id);
		select(next ? { type, id: next } : null);
	};

	const setFilter = (patch: Partial<ReportFilters>) =>
		router.replace(reportsHref(pathname, "reports", { ...filters, ...patch }), {
			scroll: false,
		});

	const list =
		tab === "reports" ? (
			reports.isPending ? (
				<ListLoading label={t("reports.loading")} />
			) : reports.isError ? (
				<ListError
					error={reports.error}
					fallback={t("reports.loadError")}
					onRetry={() => void reports.refetch()}
				/>
			) : reportItems.length === 0 ? (
				<ListEmpty>
					{filters.status === "pending"
						? t("reports.empty")
						: t("reports.emptyFiltered")}
				</ListEmpty>
			) : (
				<div className="space-y-3">
					<ReportsTable
						reports={reportItems}
						selection={selection}
						panelHref={hrefFor}
					/>
					{reports.hasNextPage ? (
						<LoadMore
							onClick={() => void reports.fetchNextPage()}
							loading={reports.isFetchingNextPage}
						/>
					) : null}
				</div>
			)
		) : listings.isPending ? (
			<ListLoading label={t("listings.loading")} />
		) : listings.isError ? (
			<ListError
				error={listings.error}
				fallback={t("listings.loadError")}
				onRetry={() => void listings.refetch()}
			/>
		) : listingItems.length === 0 ? (
			<ListEmpty>{t("listings.empty")}</ListEmpty>
		) : (
			<div className="space-y-3">
				<PendingListingsTable
					listings={listingItems}
					selection={selection}
					panelHref={hrefFor}
				/>
				{listings.hasNextPage ? (
					<LoadMore
						onClick={() => void listings.fetchNextPage()}
						loading={listings.isFetchingNextPage}
					/>
				) : null}
			</div>
		);

	const detail =
		selection?.type === "report" ? (
			<ReportPanel
				key={selection.id}
				reportId={selection.id}
				listingHref={listingHref}
				onDecided={(id) => onDecided("report", id)}
			/>
		) : selection?.type === "listing" ? (
			<ListingPanel
				key={selection.id}
				listingId={selection.id}
				onDecided={(id) => onDecided("listing", id)}
			/>
		) : (
			<DetailNotFound />
		);

	return (
		<div className="space-y-5">
			<ConsoleHeader
				title={t("reports.title")}
				subtitle={
					summary.data
						? t("reports.subtitle", {
								reports: summary.data.pendingReports,
								listings: summary.data.pendingListings,
							})
						: t("reports.subtitleLoading")
				}
			/>
			<nav
				aria-label={t("reports.sectionsLabel")}
				className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:flex-wrap sm:px-0"
			>
				<FilterChip
					href={reportsHref(pathname, "reports")}
					active={tab === "reports"}
					count={summary.data?.pendingReports ?? null}
				>
					{t("reports.tabReports")}
				</FilterChip>
				<FilterChip
					href={reportsHref(pathname, "listings")}
					active={tab === "listings"}
					count={summary.data?.pendingListings ?? null}
				>
					{t("reports.tabListings")}
				</FilterChip>
			</nav>
			{tab === "reports" ? (
				<fieldset className="flex min-w-0 flex-wrap items-center gap-2">
					<legend className="sr-only">{t("reports.filtersLabel")}</legend>
					{REPORT_STATUSES.map((status) => (
						<FilterChip
							key={status}
							href={reportsHref(pathname, "reports", { ...filters, status })}
							active={filters.status === status}
						>
							{t(REPORT_STATUS_LABELS[status])}
						</FilterChip>
					))}
					<span aria-hidden="true" className="mx-1 h-6 w-px bg-line" />
					<label className="sr-only" htmlFor="reports-reason">
						{t("reports.reasonFilter")}
					</label>
					<select
						id="reports-reason"
						value={filters.reason ?? ""}
						onChange={(event) =>
							setFilter({
								reason: isReportReason(event.target.value)
									? event.target.value
									: undefined,
							})
						}
						className={SELECT}
					>
						<option value="">{t("reports.anyReason")}</option>
						{Object.entries(REPORT_REASON_LABELS).map(([code, key]) => (
							<option key={code} value={code}>
								{t(key)}
							</option>
						))}
					</select>
					<label className="sr-only" htmlFor="reports-target">
						{t("reports.targetFilter")}
					</label>
					<select
						id="reports-target"
						value={filters.target ?? ""}
						onChange={(event) =>
							setFilter({
								target: isReportTargetType(event.target.value)
									? event.target.value
									: undefined,
							})
						}
						className={SELECT}
					>
						<option value="">{t("reports.anyTarget")}</option>
						{REPORT_TARGET_TYPES.map((type) => (
							<option key={type} value={type}>
								{t(TARGET_TYPE_LABELS[type])}
							</option>
						))}
					</select>
				</fieldset>
			) : null}
			<MasterDetail
				list={list}
				open={selection !== null}
				onClose={() => select(null)}
				detail={detail}
			/>
		</div>
	);
}
