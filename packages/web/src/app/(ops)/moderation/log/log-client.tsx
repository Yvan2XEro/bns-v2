"use client";

import { Download } from "lucide-react";
import { usePathname, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import {
	ListEmpty,
	ListError,
	ListLoading,
	LoadMore,
	PanelError,
} from "~/components/moderation/console-parts";
import { LogFilterForm } from "~/components/moderation/log-filters";
import { LogTable } from "~/components/moderation/log-table";
import { ConsoleHeader } from "~/components/moderation/master-detail";
import {
	useExportLogCsv,
	useModerationLog,
} from "~/hooks/use-moderation-shops";
import { hasLogFilters, parseLogFilters } from "~/lib/moderation-log";

export function LogClient() {
	const t = useTranslations("ModerationConsole");
	const pathname = usePathname();
	const params = useSearchParams();
	const filters = parseLogFilters(params);
	const log = useModerationLog(filters);
	const exportCsv = useExportLogCsv();
	const rows = log.data?.pages.flatMap((page) => page.items) ?? [];

	return (
		<div className="space-y-5">
			<ConsoleHeader
				title={t("log.title")}
				subtitle={t("log.subtitle")}
				actions={
					<button
						type="button"
						onClick={() => exportCsv.mutate(filters)}
						disabled={exportCsv.isPending}
						className="inline-flex h-10 items-center gap-2 rounded-lg border border-line-strong bg-surface px-4 font-semibold text-ink text-sm hover:bg-subtle focus-visible:outline-2 focus-visible:outline-brand disabled:opacity-60"
					>
						<Download aria-hidden="true" className="h-4 w-4" />
						{exportCsv.isPending ? t("log.exporting") : t("log.export")}
					</button>
				}
			/>
			{exportCsv.isError ? (
				<PanelError error={exportCsv.error} fallback={t("log.exportError")} />
			) : null}
			<LogFilterForm
				key={params.toString()}
				pathname={pathname}
				filters={filters}
			/>
			{log.isPending ? (
				<ListLoading label={t("log.loading")} />
			) : log.isError ? (
				<ListError
					error={log.error}
					fallback={t("log.loadError")}
					onRetry={() => void log.refetch()}
				/>
			) : rows.length === 0 ? (
				<ListEmpty>
					{hasLogFilters(filters) ? t("log.emptyFiltered") : t("log.empty")}
				</ListEmpty>
			) : (
				<div className="space-y-3">
					<LogTable rows={rows} />
					{log.hasNextPage ? (
						<LoadMore
							onClick={() => void log.fetchNextPage()}
							loading={log.isFetchingNextPage}
						/>
					) : null}
					<p className="text-center text-ink-muted text-xs">
						{t("log.exportCap")}
					</p>
				</div>
			)}
		</div>
	);
}
