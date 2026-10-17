"use client";

import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import { detailLabel, logActionLabel } from "~/lib/moderation-console";
import {
	isLogTargetType,
	LOG_TARGET_LABELS,
	logRoleLabel,
	logTargetHref,
} from "~/lib/moderation-log";
import { cn } from "~/lib/utils";
import type { ModerationLogRow } from "../../../../api/src/contracts/moderationConsole";
import { TranslatedCode } from "./queue-item-parts";

const TH =
	"whitespace-nowrap px-3 py-2.5 font-semibold text-[11px] uppercase tracking-wide";

const LINK =
	"rounded font-semibold text-brand hover:underline focus-visible:outline-2 focus-visible:outline-brand";

function LogTarget({ row }: { row: ModerationLogRow }) {
	const t = useTranslations("ModerationConsole");
	const type = isLogTargetType(row.targetType)
		? t(LOG_TARGET_LABELS[row.targetType])
		: row.targetType;
	const href = logTargetHref(row.targetType, row.targetId);
	const id = `…${row.targetId.slice(-6)}`;
	return (
		<>
			<span className="text-ink-soft">{type}</span>{" "}
			{href ? (
				<Link href={href} className={cn(LINK, "font-mono text-xs")}>
					{id}
				</Link>
			) : (
				<span className="font-mono text-ink-muted text-xs" title={row.targetId}>
					{id}
				</span>
			)}
		</>
	);
}

/** Log entries, newest first: when, who, what, on which target, and why. */
export function LogTable({ rows }: { rows: ModerationLogRow[] }) {
	const t = useTranslations("ModerationConsole");
	const tRoot = useTranslations();
	const locale = useLocale();
	const date = new Intl.DateTimeFormat(locale, {
		dateStyle: "short",
		timeStyle: "short",
	});
	return (
		<div className="overflow-x-auto rounded-xl border border-line bg-surface">
			<table className="w-full text-left text-sm">
				<thead className="border-line border-b bg-canvas text-ink-muted">
					<tr>
						<th className={TH}>{t("log.col.date")}</th>
						<th className={cn(TH, "hidden md:table-cell")}>
							{t("log.col.actor")}
						</th>
						<th className={TH}>{t("log.col.action")}</th>
						<th className={cn(TH, "hidden sm:table-cell")}>
							{t("log.col.target")}
						</th>
						<th className={cn(TH, "hidden lg:table-cell")}>
							{t("log.col.reason")}
						</th>
					</tr>
				</thead>
				<tbody>
					{rows.map((row) => {
						const label = logActionLabel(row.action);
						const reason = row.reason
							? detailLabel("report", row.reason)
							: null;
						const role = logRoleLabel(row.actorRole);
						return (
							<tr
								key={row.id}
								className="border-line border-t align-top first:border-t-0"
							>
								<td className="whitespace-nowrap px-3 py-2.5 text-ink-muted tabular-nums">
									{date.format(new Date(row.createdAt))}
								</td>
								<td className="hidden max-w-[12rem] px-3 py-2.5 md:table-cell">
									<span className="block truncate text-ink">
										{row.actor?.name ??
											(row.actor ? row.actor.id : t("log.system"))}
									</span>
									<span className="text-ink-muted text-xs">
										{role ? t(role) : row.actorRole}
									</span>
								</td>
								<td className="max-w-[16rem] px-3 py-2.5">
									<span className="font-semibold text-ink">
										{"raw" in label ? (
											<span className="font-mono text-xs">{label.raw}</span>
										) : (
											tRoot(label.key)
										)}
									</span>
									<p className="text-ink-muted text-xs md:hidden">
										{row.actor?.name ?? t("log.system")}
									</p>
									<p className="text-xs sm:hidden">
										<LogTarget row={row} />
									</p>
								</td>
								<td className="hidden px-3 py-2.5 sm:table-cell">
									<LogTarget row={row} />
								</td>
								<td className="hidden max-w-[20rem] px-3 py-2.5 lg:table-cell">
									{reason ? (
										<span className="text-ink-soft">
											<TranslatedCode label={reason} />
										</span>
									) : null}
									{row.note ? (
										<p className="line-clamp-2 break-words text-ink-muted text-xs">
											{row.note}
										</p>
									) : null}
									{!reason && !row.note ? (
										<span className="text-ink-muted">—</span>
									) : null}
								</td>
							</tr>
						);
					})}
				</tbody>
			</table>
		</div>
	);
}
