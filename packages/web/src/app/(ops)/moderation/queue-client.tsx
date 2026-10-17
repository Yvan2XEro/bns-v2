"use client";

import { Zap } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { ConsoleQueueTable } from "~/components/moderation/console-queue-table";
import {
	ConsoleHeader,
	DetailNotFound,
	FilterChip,
	MasterDetail,
} from "~/components/moderation/master-detail";
import { QueueItemPanel } from "~/components/moderation/queue-item-panel";
import { useAuth } from "~/hooks/use-auth";
import {
	useClaimRiskFlag,
	useModerationQueue,
	useModerationSummary,
	useTakeNextQueueItem,
} from "~/hooks/use-moderation-console";
import { useUrlSelection } from "~/hooks/use-url-selection";
import { resolveErrorMessage } from "~/lib/apiError";
import {
	consoleHref,
	isAssignable,
	parseQueueFilters,
	QUEUE_TYPE_LABELS,
	QUEUE_TYPE_ORDER,
	selectedQueueItem,
	typeCount,
	workspaceHref,
} from "~/lib/moderation-console";
import type { ModerationQueueItem } from "../../../../../api/src/contracts/moderationConsole";

export function QueueClient() {
	const t = useTranslations("ModerationConsole");
	const tRoot = useTranslations();
	const pathname = usePathname();
	const router = useRouter();
	const params = useSearchParams();
	const filters = parseQueueFilters(params);
	const { selection, select, hrefFor } = useUrlSelection();
	const { user } = useAuth();
	const viewerId = user?.id ?? null;

	const summary = useModerationSummary();
	const all = useModerationQueue({});
	const mine = useModerationQueue({ mine: true });
	const queue = useModerationQueue(filters);
	const takeNext = useTakeNextQueueItem();
	const claim = useClaimRiskFlag();
	const [nothingLeft, setNothingLeft] = useState(false);
	const [taken, setTaken] = useState<ModerationQueueItem | null>(null);

	const items = queue.data?.pages.flatMap((page) => page.items) ?? [];
	const truncated = queue.data?.pages.some((page) => page.truncated) ?? false;
	const total = all.data?.pages[0]?.total;
	const selected = selectedQueueItem(items, selection, taken);

	const onTakeNext = () => {
		setNothingLeft(false);
		takeNext.mutate(isAssignable(filters.type) ? filters.type : undefined, {
			onSuccess: ({ item }) => {
				if (!item) {
					setNothingLeft(true);
					return;
				}
				const workspace = workspaceHref(item);
				if (workspace) router.push(workspace);
				else {
					setTaken(item);
					select(item);
				}
			},
		});
	};

	const chips = [
		{
			key: "all",
			label: t("queue.all"),
			href: consoleHref(pathname, {}),
			active: !filters.type && !filters.mine,
			count: total ?? null,
		},
		...QUEUE_TYPE_ORDER.map((type) => ({
			key: type,
			label: t(QUEUE_TYPE_LABELS[type]),
			href: consoleHref(pathname, { type, mine: filters.mine }),
			active: filters.type === type,
			count: typeCount(summary.data, type),
		})),
	];

	const list = queue.isPending ? (
		<output
			aria-label={t("queue.loading")}
			className="block h-48 animate-pulse rounded-xl bg-subtle"
		/>
	) : queue.isError ? (
		<div
			role="alert"
			className="rounded-xl border border-line bg-surface p-8 text-center"
		>
			<p className="font-semibold text-ink">
				{resolveErrorMessage(queue.error, tRoot, t("queue.loadError"))}
			</p>
			<button
				type="button"
				onClick={() => void queue.refetch()}
				className="mt-4 h-10 rounded-lg bg-brand-fill px-4 font-semibold text-sm text-white focus-visible:outline-2 focus-visible:outline-brand focus-visible:outline-offset-2"
			>
				{t("queue.retry")}
			</button>
		</div>
	) : items.length === 0 ? (
		<p className="rounded-xl border border-line bg-surface p-8 text-center text-ink-muted text-sm">
			{filters.mine
				? t("queue.emptyMine")
				: filters.type
					? t("queue.emptyType")
					: t("queue.empty")}
		</p>
	) : (
		<div className="space-y-3">
			<ConsoleQueueTable
				items={items}
				viewerId={viewerId}
				selection={selection}
				panelHref={hrefFor}
			/>
			{truncated ? (
				<p className="rounded-lg border border-warn-line bg-warn-faint px-3 py-2 text-sm text-warn-ink">
					{t("queue.truncated")}
				</p>
			) : null}
			{queue.hasNextPage ? (
				<div className="text-center">
					<button
						type="button"
						onClick={() => void queue.fetchNextPage()}
						disabled={queue.isFetchingNextPage}
						className="h-10 rounded-lg border border-line-strong bg-surface px-4 font-semibold text-ink text-sm hover:bg-subtle focus-visible:outline-2 focus-visible:outline-brand disabled:opacity-60"
					>
						{queue.isFetchingNextPage
							? t("queue.loadingMore")
							: t("queue.loadMore")}
					</button>
				</div>
			) : null}
		</div>
	);

	return (
		<div className="space-y-5">
			<ConsoleHeader
				title={t("queue.title")}
				subtitle={
					total !== undefined && summary.data
						? t("queue.subtitle", {
								total,
								overdue: summary.data.disputesOverdue,
							})
						: t("queue.subtitleLoading")
				}
				actions={
					<button
						type="button"
						onClick={onTakeNext}
						disabled={takeNext.isPending}
						className="inline-flex h-10 items-center gap-2 rounded-lg bg-brand-fill px-4 font-semibold text-sm text-white hover:bg-brand-strong focus-visible:outline-2 focus-visible:outline-brand focus-visible:outline-offset-2 disabled:opacity-60"
					>
						<Zap aria-hidden="true" className="h-4 w-4" />
						{takeNext.isPending ? t("queue.takingNext") : t("queue.takeNext")}
					</button>
				}
			/>
			{nothingLeft ? (
				<output className="block rounded-lg border border-brand-line bg-brand-soft px-3 py-2 text-brand text-sm">
					{t("queue.nothingLeft")}
				</output>
			) : null}
			{takeNext.isError ? (
				<p
					role="alert"
					className="rounded-lg border border-bad-line bg-bad-faint px-3 py-2 text-bad-ink text-sm"
				>
					{resolveErrorMessage(takeNext.error, tRoot, t("queue.takeNextError"))}
				</p>
			) : null}
			<nav
				aria-label={t("queue.filtersLabel")}
				className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:flex-wrap sm:px-0"
			>
				{chips.map((chip) => (
					<FilterChip
						key={chip.key}
						href={chip.href}
						active={chip.active}
						count={chip.count}
					>
						{chip.label}
					</FilterChip>
				))}
				<span aria-hidden="true" className="mx-1 w-px shrink-0 bg-line" />
				<FilterChip
					href={consoleHref(pathname, {
						type: filters.type,
						mine: filters.mine ? undefined : true,
					})}
					active={filters.mine === true}
					count={mine.data?.pages[0]?.total ?? null}
				>
					{t("queue.mine")}
				</FilterChip>
			</nav>
			<MasterDetail
				list={list}
				open={selection !== null}
				onClose={() => select(null)}
				detail={
					selected ? (
						<QueueItemPanel
							item={selected}
							viewerId={viewerId}
							claim={
								selected.type === "risk"
									? {
											run: () => claim.mutate(selected.id),
											pending:
												claim.isPending && claim.variables === selected.id,
											error:
												claim.variables === selected.id ? claim.error : null,
										}
									: undefined
							}
						/>
					) : queue.isPending ? null : (
						<DetailNotFound />
					)
				}
			/>
		</div>
	);
}
