"use client";

import { AlertTriangle } from "lucide-react";
import { useTranslations } from "next-intl";
import {
	Dialog,
	DialogContent,
	DialogHeader,
	DialogTitle,
} from "~/components/ui/dialog";
import { activityLabelKey, visibleActivityDetails } from "~/lib/shop-activity";
import type { ShopActivityView } from "~/types";

/**
 * The append-only log has no edit or delete affordance anywhere in this
 * drawer — it only ever reads an entry back.
 *
 * `canSeeCost` is the client-side half of the cost rule: the server already
 * refuses to write a cost field outside `variant.cost_changed`
 * (`assertNoCostLeak` in `packages/api/src/services/shopActivity.ts`), but a
 * staff-level viewer must never see a cost figure even if that write-time
 * guard were ever wrong. `visibleActivityDetails` does the actual filtering;
 * this component only renders what it returns.
 */
export function ActivityDetails({
	entry,
	canSeeCost,
	onClose,
}: {
	entry: ShopActivityView | null;
	canSeeCost: boolean;
	onClose: () => void;
}) {
	const t = useTranslations();
	const tActivity = useTranslations("shopActivity");

	const view = entry ? visibleActivityDetails(entry, canSeeCost) : null;

	return (
		<Dialog open={entry !== null} onOpenChange={(open) => !open && onClose()}>
			<DialogContent>
				{entry && view && (
					<>
						<DialogHeader>
							<DialogTitle>{t(activityLabelKey(entry.action))}</DialogTitle>
						</DialogHeader>

						{view.costHidden && (
							<p className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-amber-900 text-sm">
								<AlertTriangle
									aria-hidden="true"
									className="mt-0.5 h-4 w-4 shrink-0"
								/>
								{tActivity("costHidden")}
							</p>
						)}

						{view.changes.length === 0 && view.other.length === 0 ? (
							<p className="text-[#64748B] text-sm">{tActivity("noChanges")}</p>
						) : (
							<div className="space-y-4">
								{view.changes.length > 0 && (
									<table className="w-full text-sm">
										<thead>
											<tr className="text-left text-[#64748B]">
												<th className="py-1 font-medium">
													{tActivity("before")}
												</th>
												<th className="py-1 font-medium">
													{tActivity("after")}
												</th>
											</tr>
										</thead>
										<tbody>
											{view.changes.map((row) => (
												<tr
													key={row.field}
													className="border-[#F1F5F9] border-t"
												>
													<td className="py-2 pr-4 text-[#0F172A]">
														<span className="text-[#64748B]">
															{row.field}:{" "}
														</span>
														{row.before}
													</td>
													<td className="py-2 text-[#0F172A]">{row.after}</td>
												</tr>
											))}
										</tbody>
									</table>
								)}

								{view.other.length > 0 && (
									<dl className="space-y-1 text-sm">
										<p className="font-medium text-[#64748B]">
											{tActivity("otherDetails")}
										</p>
										{view.other.map((row) => (
											<div key={row.key} className="flex justify-between gap-4">
												<dt className="text-[#64748B]">{row.key}</dt>
												<dd className="text-[#0F172A]">{row.value}</dd>
											</div>
										))}
									</dl>
								)}
							</div>
						)}
					</>
				)}
			</DialogContent>
		</Dialog>
	);
}
