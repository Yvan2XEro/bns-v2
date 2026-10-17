"use client";

import { ArrowRight } from "lucide-react";
import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import type { ReactNode } from "react";
import { AgeChip } from "~/components/moderation/age-chip";
import { resolveErrorMessage } from "~/lib/apiError";
import { handledHref, targetLabel } from "~/lib/moderation-console";
import { relativeAge } from "~/lib/moderation-verification";
import type { ModerationQueueItem } from "../../../../api/src/contracts/moderationConsole";
import {
	QueueAssignee,
	QueueDue,
	QueueItemDetail,
	QueueTypeBadge,
} from "./queue-item-parts";

function Row({ label, children }: { label: string; children: ReactNode }) {
	return (
		<div className="flex justify-between gap-3 text-sm">
			<dt className="text-ink-muted">{label}</dt>
			<dd className="min-w-0 text-right font-semibold text-ink">{children}</dd>
		</div>
	);
}

/**
 * The compact summary a panel item shows in the queue, with the way to where
 * it is decided. Lot 3 replaces it with full report/listing/risk panels.
 */
export function QueueItemPanel({
	item,
	viewerId,
	claim,
}: {
	item: ModerationQueueItem;
	viewerId: string | null;
	/** Risk flags only: assign it to the viewer. Omitted, no button. */
	claim?: {
		run: () => void;
		pending: boolean;
		error: unknown;
	};
}) {
	const t = useTranslations("ModerationConsole");
	const tRoot = useTranslations();
	const locale = useLocale();
	const date = new Intl.DateTimeFormat(locale, {
		dateStyle: "medium",
		timeStyle: "short",
	});
	const format = (iso: string) => date.format(new Date(iso));
	const href = handledHref(item);
	const target = targetLabel(item.targetType);

	return (
		<div className="space-y-4">
			<div className="space-y-2">
				<QueueTypeBadge type={item.type} />
				<h2 className="break-words font-bold font-heading text-ink text-lg">
					{item.title}
				</h2>
				{item.subtitle ? (
					<p className="text-ink-muted text-sm">{item.subtitle}</p>
				) : null}
			</div>
			<dl className="space-y-2">
				<Row label={t("panel.detail")}>
					<QueueItemDetail item={item} />
				</Row>
				{target ? <Row label={t("panel.target")}>{t(target)}</Row> : null}
				{item.severity ? (
					<Row label={t("panel.severity")}>
						{t(`severity.${item.severity}`)}
					</Row>
				) : null}
				{item.score !== null ? (
					<Row label={t("panel.score")}>{item.score}</Row>
				) : null}
				<Row label={t("panel.created")}>
					<span className="inline-flex flex-wrap items-center justify-end gap-2">
						{format(item.createdAt)}
						<AgeChip age={relativeAge(item.createdAt)} />
					</span>
				</Row>
				{item.dueAt || item.overdue ? (
					<Row label={t("panel.due")}>
						<QueueDue item={item} format={format} />
					</Row>
				) : null}
				<Row label={t("panel.assignee")}>
					<QueueAssignee assignee={item.assignee} viewerId={viewerId} />
				</Row>
			</dl>
			{claim && !item.assignee ? (
				<div className="space-y-2">
					<button
						type="button"
						onClick={claim.run}
						disabled={claim.pending}
						className="h-10 w-full rounded-lg border border-line-strong bg-surface px-4 font-semibold text-ink text-sm hover:bg-subtle focus-visible:outline-2 focus-visible:outline-brand disabled:opacity-60"
					>
						{claim.pending ? t("panel.claiming") : t("panel.claim")}
					</button>
					{claim.error ? (
						<p role="alert" className="text-bad-ink text-sm">
							{resolveErrorMessage(claim.error, tRoot, t("panel.claimError"))}
						</p>
					) : null}
				</div>
			) : null}
			{href ? (
				<Link
					href={href}
					className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-lg bg-brand-fill px-4 font-semibold text-sm text-white hover:bg-brand-strong focus-visible:outline-2 focus-visible:outline-brand focus-visible:outline-offset-2"
				>
					{t(`panel.open.${item.type}`)}
					<ArrowRight aria-hidden="true" className="h-4 w-4" />
				</Link>
			) : null}
		</div>
	);
}
