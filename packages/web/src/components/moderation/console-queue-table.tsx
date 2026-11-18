"use client";

import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import { AgeChip } from "~/components/moderation/age-chip";
import {
	isSelected,
	type QueueSelection,
	workspaceHref,
} from "~/lib/moderation-console";
import { relativeAge } from "~/lib/moderation-verification";
import { cn } from "~/lib/utils";
import type { ModerationQueueItem } from "../../../../api/src/contracts/moderationConsole";
import {
	QueueAssignee,
	QueueDue,
	QueueItemDetail,
	QueueTypeBadge,
} from "./queue-item-parts";

/**
 * The merged queue. Verifications and disputes link to their workspaces;
 * every other row opens the side panel through `panelHref`.
 */
export function ConsoleQueueTable({
	items,
	viewerId,
	selection,
	panelHref,
	now,
}: {
	items: ModerationQueueItem[];
	viewerId: string | null;
	selection: QueueSelection | null;
	panelHref: (item: QueueSelection) => string;
	now?: Date;
}) {
	const t = useTranslations("ModerationConsole");
	const locale = useLocale();
	const date = new Intl.DateTimeFormat(locale, {
		dateStyle: "medium",
		timeStyle: "short",
	});
	const format = (iso: string) => date.format(new Date(iso));
	const th =
		"whitespace-nowrap px-3 py-2.5 font-semibold text-[11px] uppercase tracking-wide";

	return (
		<div className="overflow-x-auto rounded-xl border border-line bg-surface">
			<table className="w-full text-left text-sm">
				<thead className="border-line border-b bg-canvas text-ink-muted">
					<tr>
						<th className={th}>{t("queue.col.type")}</th>
						<th className={th}>{t("queue.col.item")}</th>
						<th className={cn(th, "hidden md:table-cell")}>
							{t("queue.col.detail")}
						</th>
						<th className={th}>{t("queue.col.age")}</th>
						<th className={cn(th, "hidden lg:table-cell")}>
							{t("queue.col.due")}
						</th>
						<th className={cn(th, "hidden lg:table-cell")}>
							{t("queue.col.assignee")}
						</th>
					</tr>
				</thead>
				<tbody>
					{items.map((item) => {
						const selected = isSelected(item, selection);
						const href = workspaceHref(item) ?? panelHref(item);
						return (
							<tr
								key={`${item.type}:${item.id}`}
								data-type={item.type}
								aria-current={selected ? "true" : undefined}
								className={cn(
									"border-line border-t align-top first:border-t-0",
									selected ? "bg-brand-soft" : "hover:bg-canvas",
									item.overdue && !selected && "bg-bad-faint",
								)}
							>
								<td className="px-3 py-3">
									<QueueTypeBadge type={item.type} />
								</td>
								<td className="max-w-[16rem] px-3 py-3">
									<Link
										href={href}
										scroll={false}
										className="block truncate rounded font-semibold text-ink hover:text-brand hover:underline focus-visible:outline-2 focus-visible:outline-brand"
									>
										{item.title}
									</Link>
									{item.subtitle ? (
										<p className="truncate text-ink-muted text-xs">
											{item.subtitle}
										</p>
									) : null}
									<p className="text-ink-soft text-xs md:hidden">
										<QueueItemDetail item={item} />
									</p>
									{item.overdue ? (
										<p className="mt-1 lg:hidden">
											<QueueDue item={item} format={format} />
										</p>
									) : null}
								</td>
								<td className="hidden px-3 py-3 text-ink-soft md:table-cell">
									<QueueItemDetail item={item} />
								</td>
								<td className="px-3 py-3">
									<AgeChip age={relativeAge(item.createdAt, now)} />
								</td>
								<td className="hidden px-3 py-3 lg:table-cell">
									<QueueDue item={item} format={format} />
								</td>
								<td className="hidden px-3 py-3 lg:table-cell">
									<QueueAssignee assignee={item.assignee} viewerId={viewerId} />
								</td>
							</tr>
						);
					})}
				</tbody>
			</table>
		</div>
	);
}
