"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import { activityLabelKey, activityTargetHref } from "~/lib/shop-activity";
import type { ShopActivityView } from "~/types";

function TargetCell({ entry }: { entry: ShopActivityView }) {
	const t = useTranslations();
	const label = t(`shopActivity.targets.${entry.targetType}`);
	const href = activityTargetHref(entry);
	// A target with nowhere to send a reader (a member, an invitation, the
	// shop itself) still reads as its kind rather than a bare id; a target
	// whose page may no longer exist (a deleted product) still gets a link —
	// that page's own not-found handling is what shows, not a dead link here.
	if (!href) return <span className="text-ink-mid">{label}</span>;
	return (
		<Link
			href={href}
			className="text-[var(--shop-accent-text,var(--c-brand))] underline hover:no-underline"
		>
			{label}
		</Link>
	);
}

function ActorCell({ entry }: { entry: ShopActivityView }) {
	const t = useTranslations("shopActivity");
	return (
		<div>
			<div className="font-medium text-ink">
				{entry.actor?.name ?? t("roles.system")}
			</div>
			<div className="text-ink-faint text-xs">
				{t(`roles.${entry.actorRole}`)}
			</div>
		</div>
	);
}

export function ActivityTable({
	entries,
	onOpenEntry,
	hasNextPage,
	isFetchingNextPage,
	onLoadMore,
}: {
	entries: ShopActivityView[];
	onOpenEntry: (entry: ShopActivityView) => void;
	hasNextPage: boolean;
	isFetchingNextPage: boolean;
	onLoadMore: () => void;
}) {
	const t = useTranslations();
	const tActivity = useTranslations("shopActivity");

	if (entries.length === 0) {
		return (
			<p className="rounded-2xl border border-line bg-surface p-8 text-center text-ink-muted text-sm">
				{tActivity("empty")}
			</p>
		);
	}

	return (
		<div className="overflow-hidden rounded-2xl border border-line bg-surface">
			<table className="w-full text-sm">
				<thead>
					<tr className="border-line border-b bg-canvas text-left text-ink-muted">
						<th className="px-4 py-2 font-medium">
							{tActivity("column.when")}
						</th>
						<th className="px-4 py-2 font-medium">{tActivity("column.who")}</th>
						<th className="px-4 py-2 font-medium">
							{tActivity("column.action")}
						</th>
						<th className="px-4 py-2 font-medium">
							{tActivity("column.target")}
						</th>
						<th className="px-4 py-2" />
					</tr>
				</thead>
				<tbody>
					{entries.map((entry) => (
						<tr key={entry.id} className="border-subtle border-b last:border-0">
							<td className="whitespace-nowrap px-4 py-3 text-ink-mid">
								{new Date(entry.createdAt).toLocaleString()}
							</td>
							<td className="px-4 py-3">
								<ActorCell entry={entry} />
							</td>
							<td className="px-4 py-3 text-ink">
								{t(activityLabelKey(entry.action))}
							</td>
							<td className="px-4 py-3">
								<TargetCell entry={entry} />
							</td>
							<td className="px-4 py-3 text-right">
								<button
									type="button"
									onClick={() => onOpenEntry(entry)}
									className="rounded-lg border border-line px-3 py-1.5 font-medium text-[var(--shop-accent-text,var(--c-brand))] text-xs hover:bg-subtle"
								>
									{tActivity("details")}
								</button>
							</td>
						</tr>
					))}
				</tbody>
			</table>
			{hasNextPage && (
				<div className="border-line border-t p-4 text-center">
					<button
						type="button"
						onClick={onLoadMore}
						disabled={isFetchingNextPage}
						className="h-9 rounded-lg border border-line px-4 font-medium text-[var(--shop-accent-text,var(--c-brand))] text-sm hover:bg-subtle disabled:opacity-50"
					>
						{tActivity("loadMore")}
					</button>
				</div>
			)}
		</div>
	);
}
