"use client";

import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import {
	detailLabel,
	isSelected,
	type QueueSelection,
} from "~/lib/moderation-console";
import {
	RISK_STATUS_LABELS,
	RISK_SUBJECT_LABELS,
	type RiskStatusView,
	riskStatusView,
} from "~/lib/moderation-risk";
import { cn } from "~/lib/utils";
import type {
	RiskFlagQueueItem,
	RiskSeverity,
} from "../../../../api/src/contracts/moderationConsole";
import { TranslatedCode } from "./queue-item-parts";

const SEVERITY_TONE: Record<RiskSeverity, string> = {
	high: "bg-bad-soft text-bad-ink",
	medium: "bg-warn-soft text-warn-ink",
	low: "bg-subtle text-ink-soft",
};

const STATUS_TONE: Record<RiskStatusView, string> = {
	new: "bg-bad-soft text-bad-ink",
	mine: "bg-brand-tint text-brand",
	inReview: "bg-warn-soft text-warn-ink",
	monitored: "bg-brand-soft text-brand",
	dismissed: "bg-subtle text-ink-soft",
	actioned: "bg-ink text-surface",
};

export function RiskScore({
	score,
	severity,
}: {
	score: number;
	severity: RiskSeverity;
}) {
	const t = useTranslations("ModerationConsole");
	return (
		<span
			className={cn(
				"inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2 py-0.5 font-bold text-xs tabular-nums",
				SEVERITY_TONE[severity],
			)}
		>
			{score}
			<span className="font-semibold">· {t(`severity.${severity}`)}</span>
		</span>
	);
}

export function RiskStatusChip({ view }: { view: RiskStatusView }) {
	const t = useTranslations("ModerationConsole");
	return (
		<span
			data-status={view}
			className={cn(
				"inline-flex items-center whitespace-nowrap rounded-full px-2.5 py-0.5 font-semibold text-xs",
				STATUS_TONE[view],
			)}
		>
			{t(RISK_STATUS_LABELS[view])}
		</span>
	);
}

/** Flags in the current tab, in the API's order (severity, then score, then recency). */
export function RiskTable({
	flags,
	viewerId,
	selection,
	panelHref,
}: {
	flags: RiskFlagQueueItem[];
	viewerId: string | null;
	selection: QueueSelection | null;
	panelHref: (item: QueueSelection) => string;
}) {
	const t = useTranslations("ModerationConsole");
	const locale = useLocale();
	const date = new Intl.DateTimeFormat(locale, {
		dateStyle: "medium",
		timeStyle: "short",
	});
	const th =
		"whitespace-nowrap px-3 py-2.5 font-semibold text-[11px] uppercase tracking-wide";

	return (
		<div className="overflow-x-auto rounded-xl border border-line bg-surface">
			<table className="w-full text-left text-sm">
				<thead className="border-line border-b bg-canvas text-ink-muted">
					<tr>
						<th className={th}>{t("risk.col.subject")}</th>
						<th className={cn(th, "hidden md:table-cell")}>
							{t("risk.col.signal")}
						</th>
						<th className={th}>{t("risk.col.score")}</th>
						<th className={cn(th, "hidden lg:table-cell")}>
							{t("risk.col.detected")}
						</th>
						<th className={cn(th, "hidden sm:table-cell")}>
							{t("risk.col.status")}
						</th>
					</tr>
				</thead>
				<tbody>
					{flags.map((flag) => {
						const item = { type: "risk" as const, id: flag.id };
						const selected = isSelected(item, selection);
						const view = riskStatusView(flag, viewerId);
						return (
							<tr
								key={flag.id}
								aria-current={selected ? "true" : undefined}
								className={cn(
									"border-line border-t align-top first:border-t-0",
									selected ? "bg-brand-soft" : "hover:bg-canvas",
								)}
							>
								<td className="max-w-[16rem] px-3 py-3">
									<Link
										href={panelHref(item)}
										scroll={false}
										className="block truncate rounded font-semibold text-ink hover:text-brand hover:underline focus-visible:outline-2 focus-visible:outline-brand"
									>
										{flag.subjectLabel ??
											t(RISK_SUBJECT_LABELS[flag.subjectType])}
									</Link>
									<p className="truncate text-ink-muted text-xs">
										{t(RISK_SUBJECT_LABELS[flag.subjectType])}
									</p>
									<p className="text-ink-soft text-xs md:hidden">
										<TranslatedCode label={detailLabel("risk", flag.signal)} />
									</p>
									<p className="mt-1 sm:hidden">
										<RiskStatusChip view={view} />
									</p>
								</td>
								<td className="hidden px-3 py-3 text-ink-soft md:table-cell">
									<TranslatedCode label={detailLabel("risk", flag.signal)} />
									{flag.occurrences > 1 ? (
										<p className="text-ink-muted text-xs">
											{t("risk.occurrences", { count: flag.occurrences })}
										</p>
									) : null}
								</td>
								<td className="px-3 py-3">
									<RiskScore score={flag.score} severity={flag.severity} />
								</td>
								<td className="hidden whitespace-nowrap px-3 py-3 text-ink-soft lg:table-cell">
									{date.format(new Date(flag.lastSeenAt))}
								</td>
								<td className="hidden px-3 py-3 sm:table-cell">
									<RiskStatusChip view={view} />
								</td>
							</tr>
						);
					})}
				</tbody>
			</table>
		</div>
	);
}
