"use client";

import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import {
	DISPUTE_REASON_LABELS,
	DISPUTE_STATUS_LABELS,
} from "~/lib/case-status";
import { assigneeView, deadlineTone } from "~/lib/moderation-disputes";
import { cn } from "~/lib/utils";
import type { ModerationDisputeRow } from "../../../../api/src/contracts/disputes";

export function DisputeQueueTable({
	rows,
	viewerId,
}: {
	rows: ModerationDisputeRow[];
	viewerId: string | null;
}) {
	const t = useTranslations("ModerationDisputes");
	const tRoot = useTranslations();
	const locale = useLocale();
	const date = new Intl.DateTimeFormat(locale, {
		dateStyle: "medium",
		timeStyle: "short",
	});

	return (
		<div className="overflow-x-auto rounded-xl border border-[#E2E8F0] bg-white">
			<table className="w-full text-left text-sm">
				<thead className="bg-[#F8FAFC] text-[#64748B] text-xs">
					<tr>
						<th className="px-3 py-2">{t("col.number")}</th>
						<th className="px-3 py-2">{t("col.reason")}</th>
						<th className="px-3 py-2">{t("col.paymentMethod")}</th>
						<th className="px-3 py-2">{t("col.amount")}</th>
						<th className="px-3 py-2">{t("col.status")}</th>
						<th className="px-3 py-2">{t("col.deadline")}</th>
						<th className="px-3 py-2">{t("col.assignee")}</th>
						<th className="px-3 py-2">{t("col.age")}</th>
					</tr>
				</thead>
				<tbody>
					{rows.map((row) => {
						const tone = deadlineTone(row);
						return (
							<tr key={row.id} className="border-[#E2E8F0] border-t">
								<td className="px-3 py-2">
									<Link
										href={`/moderation/disputes/${row.id}`}
										className="font-semibold text-[#1E40AF] hover:underline"
									>
										{row.number}
									</Link>
									<p className="text-[#64748B] text-xs">{row.orderNumber}</p>
								</td>
								<td className="px-3 py-2">
									{row.reason
										? tRoot(`Disputes.${DISPUTE_REASON_LABELS[row.reason]}`)
										: "—"}
								</td>
								<td className="px-3 py-2">
									{row.paymentMethod ? t(`payment.${row.paymentMethod}`) : "—"}
								</td>
								<td className="px-3 py-2">
									{row.amountAtStake.toLocaleString(locale)} XAF
								</td>
								<td className="px-3 py-2">
									{row.status
										? tRoot(`Disputes.${DISPUTE_STATUS_LABELS[row.status]}`)
										: "—"}
								</td>
								<td
									data-tone={tone}
									className={cn(
										"px-3 py-2",
										tone === "overdue" && "font-semibold text-red-700",
									)}
								>
									{row.deadline ? date.format(new Date(row.deadline)) : "—"}
									{tone === "overdue" ? (
										<span className="ml-2 rounded-full bg-red-50 px-2 py-0.5 text-xs">
											{tRoot("Disputes.overdue")}
										</span>
									) : null}
								</td>
								<td className="px-3 py-2">
									{t(`assignee.${assigneeView(row.assignedTo, viewerId)}`)}
								</td>
								<td className="px-3 py-2">
									{t("ageDays", { count: row.ageDays })}
								</td>
							</tr>
						);
					})}
				</tbody>
			</table>
		</div>
	);
}
