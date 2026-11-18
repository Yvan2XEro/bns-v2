"use client";

import { usePathname, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import {
	ListEmpty,
	ListError,
	ListLoading,
	LoadMore,
} from "~/components/moderation/console-parts";
import {
	ConsoleHeader,
	DetailNotFound,
	FilterChip,
	MasterDetail,
} from "~/components/moderation/master-detail";
import { RiskKpis } from "~/components/moderation/risk-kpis";
import { RiskPanel } from "~/components/moderation/risk-panel";
import { RiskTable } from "~/components/moderation/risk-table";
import { useAuth } from "~/hooks/use-auth";
import { useRiskFlags, useRiskStats } from "~/hooks/use-moderation-risk";
import { useUrlSelection } from "~/hooks/use-url-selection";
import { nextAfter } from "~/lib/moderation-reports";
import {
	parseRiskTab,
	RISK_TAB_LABELS,
	RISK_TABS,
	riskTabCount,
	riskTabHref,
} from "~/lib/moderation-risk";

export function RiskClient() {
	const t = useTranslations("ModerationConsole");
	const pathname = usePathname();
	const params = useSearchParams();
	const tab = parseRiskTab(params.get("tab"));
	const { selection, select, hrefFor } = useUrlSelection();
	const { user } = useAuth();
	const viewerId = user?.id ?? null;
	const stats = useRiskStats();
	const flags = useRiskFlags(tab);
	const items = flags.data?.pages.flatMap((page) => page.items) ?? [];

	const onDecided = (id: string) => {
		const next = nextAfter(
			items.map((flag) => flag.id),
			id,
		);
		select(next ? { type: "risk", id: next } : null);
	};

	const list = flags.isPending ? (
		<ListLoading label={t("risk.loading")} />
	) : flags.isError ? (
		<ListError
			error={flags.error}
			fallback={t("risk.loadError")}
			onRetry={() => void flags.refetch()}
		/>
	) : items.length === 0 ? (
		<ListEmpty>
			{tab === "dismissed" || tab === "reviewed"
				? t("risk.emptyDecided")
				: t("risk.empty")}
		</ListEmpty>
	) : (
		<div className="space-y-3">
			<RiskTable
				flags={items}
				viewerId={viewerId}
				selection={selection}
				panelHref={hrefFor}
			/>
			{flags.hasNextPage ? (
				<LoadMore
					onClick={() => void flags.fetchNextPage()}
					loading={flags.isFetchingNextPage}
				/>
			) : null}
		</div>
	);

	return (
		<div className="space-y-5">
			<ConsoleHeader
				title={t("risk.title")}
				subtitle={
					stats.data
						? t("risk.subtitle", { open: stats.data.open })
						: t("risk.subtitleLoading")
				}
			/>
			<RiskKpis stats={stats.data} />
			<nav
				aria-label={t("risk.tabsLabel")}
				className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:flex-wrap sm:px-0"
			>
				{RISK_TABS.map((entry) => (
					<FilterChip
						key={entry}
						href={riskTabHref(pathname, entry)}
						active={tab === entry}
						count={riskTabCount(stats.data, entry)}
					>
						{t(RISK_TAB_LABELS[entry])}
					</FilterChip>
				))}
			</nav>
			<MasterDetail
				list={list}
				open={selection !== null}
				onClose={() => select(null)}
				detail={
					selection?.type === "risk" ? (
						<RiskPanel
							key={selection.id}
							flagId={selection.id}
							viewerId={viewerId}
							isAdmin={user?.role === "admin"}
							panelHref={hrefFor}
							onDecided={onDecided}
						/>
					) : (
						<DetailNotFound />
					)
				}
			/>
		</div>
	);
}
