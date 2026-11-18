"use client";

import { useTranslations } from "next-intl";
import {
	type DetailLabel,
	detailLabel,
	QUEUE_TYPE_LABELS,
} from "~/lib/moderation-console";
import { assigneeView } from "~/lib/moderation-disputes";
import { cn } from "~/lib/utils";
import type {
	ModerationPerson,
	ModerationQueueItem,
	ModerationQueueType,
} from "../../../../api/src/contracts/moderationConsole";

const TYPE_TONE: Record<ModerationQueueType, string> = {
	report: "bg-warn-soft text-warn-ink",
	listing: "bg-subtle text-ink-soft",
	verification: "bg-brand-tint text-brand",
	dispute: "bg-brand-fill text-white",
	risk: "bg-bad-soft text-bad-ink",
	payoutAccount: "bg-ok-soft text-ok-ink",
};

export function QueueTypeBadge({ type }: { type: ModerationQueueType }) {
	const t = useTranslations("ModerationConsole");
	return (
		<span
			className={cn(
				"inline-flex items-center whitespace-nowrap rounded-full px-2.5 py-0.5 font-semibold text-xs",
				TYPE_TONE[type],
			)}
		>
			{t(QUEUE_TYPE_LABELS[type])}
		</span>
	);
}

/** Renders a `DetailLabel`: its translation, or the raw code. */
export function TranslatedCode({ label }: { label: DetailLabel | null }) {
	const tRoot = useTranslations();
	if (!label) return <>—</>;
	if ("raw" in label)
		return <span className="font-mono text-xs">{label.raw}</span>;
	return <>{tRoot(label.key, label.values)}</>;
}

export function QueueItemDetail({
	item,
}: {
	item: Pick<ModerationQueueItem, "type" | "detail">;
}) {
	return <TranslatedCode label={detailLabel(item.type, item.detail)} />;
}

export function QueueAssignee({
	assignee,
	viewerId,
}: {
	assignee: ModerationPerson | null;
	viewerId: string | null;
}) {
	const t = useTranslations("ModerationConsole");
	const view = assigneeView(assignee?.id ?? null, viewerId);
	if (view === "unassigned")
		return <span className="text-ink-muted">{t("queue.unassigned")}</span>;
	if (view === "me")
		return <span className="font-semibold text-brand">{t("queue.me")}</span>;
	return <>{assignee?.name ?? assignee?.id}</>;
}

export function QueueDue({
	item,
	format,
}: {
	item: Pick<ModerationQueueItem, "dueAt" | "overdue">;
	format: (iso: string) => string;
}) {
	const t = useTranslations("ModerationConsole");
	if (item.overdue)
		return (
			<span
				data-tone="overdue"
				className="inline-flex items-center whitespace-nowrap rounded-full bg-bad-soft px-2 py-0.5 font-semibold text-bad-ink text-xs"
			>
				{t("queue.overdue")}
				{item.dueAt ? ` · ${format(item.dueAt)}` : null}
			</span>
		);
	return item.dueAt ? (
		<span className="whitespace-nowrap">{format(item.dueAt)}</span>
	) : (
		<span className="text-ink-muted">—</span>
	);
}
