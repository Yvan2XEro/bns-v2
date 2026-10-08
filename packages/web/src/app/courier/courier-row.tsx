"use client";

import { useLocale, useTranslations } from "next-intl";
import { useState } from "react";
import { Button } from "~/components/ui/button";
import {
	useAssignCourierRider,
	useDeclareRemitted,
} from "~/hooks/use-courier-space";
import { resolveErrorMessage } from "~/lib/apiError";
import {
	courierRowActions,
	riderOptions,
	rowSummary,
} from "~/lib/courier-space";
import { formatXaf } from "~/lib/order-money";
import { shipmentStatusLabel } from "~/lib/shipment-status";
import type { CourierShipmentRow } from "../../../../api/src/contracts/shipments";
import type { CourierMember } from "../../../../api/src/payload-types";

export function CourierRow({
	row,
	dispatcherOf,
	members,
	userId,
}: {
	row: CourierShipmentRow;
	dispatcherOf: ReadonlySet<string>;
	members: readonly CourierMember[];
	userId: string | null;
}) {
	const t = useTranslations("Courier");
	const tRoot = useTranslations();
	const locale = useLocale() === "en" ? "en" : "fr";
	const summary = rowSummary(row);
	const actions = courierRowActions(row, dispatcherOf);
	const [open, setOpen] = useState(false);
	const [rider, setRider] = useState("");
	const assign = useAssignCourierRider();
	const remit = useDeclareRemitted();
	const options = riderOptions(members, row.courierId ?? "");
	const mine = row.rider?.user === userId;
	const error = assign.error ?? remit.error;

	return (
		<li className="space-y-2 rounded-2xl border border-[#E2E8F0] bg-white p-4 text-sm">
			<div className="flex flex-wrap items-center justify-between gap-2">
				<p className="font-semibold text-[#0F172A]">{summary.number}</p>
				<span className="rounded-full bg-[#EFF6FF] px-3 py-1 font-semibold text-[#1E40AF] text-xs">
					{tRoot(`Delivery.${shipmentStatusLabel("seller", row.status)}`)}
				</span>
			</div>
			<p className="text-[#334155]">{summary.where}</p>
			{summary.expectedCod !== null && (
				<p className="text-[#92400E]">
					{t("cod", { amount: formatXaf(summary.expectedCod, locale) })}
				</p>
			)}
			<p className="text-[#64748B]">
				{summary.riderName
					? t("rider", { name: summary.riderName })
					: t("noRider")}
				{mine ? ` · ${t("mine")}` : ""}
			</p>
			{actions.includes("assign_rider") && (
				<div className="flex flex-wrap items-center gap-2">
					<Button
						variant="outline"
						className="min-h-11"
						onClick={() => setOpen((v) => !v)}
					>
						{t("assign")}
					</Button>
					{open && (
						<>
							<select
								aria-label={t("assign")}
								value={rider}
								onChange={(e) => setRider(e.target.value)}
								className="h-11 rounded-xl border border-[#DBEAFE] bg-[#F8FAFF] px-3"
							>
								<option value="">{t("riderChoose")}</option>
								{options.map((option) => (
									<option
										key={option.userId}
										value={option.userId}
										disabled={!option.assignable}
									>
										{option.label}
										{option.assignable ? "" : ` — ${t("noConsent")}`}
									</option>
								))}
							</select>
							<Button
								className="min-h-11"
								disabled={!rider || assign.isPending}
								onClick={() =>
									assign.mutate(
										{ shipmentId: row.id, riderUserId: rider },
										{ onSuccess: () => setOpen(false) },
									)
								}
							>
								{t("assignConfirm")}
							</Button>
						</>
					)}
				</div>
			)}
			{actions.includes("declare_remittance") && (
				<Button
					className="min-h-11"
					disabled={remit.isPending}
					onClick={() => remit.mutate({ shipmentId: row.id })}
				>
					{t("declareRemittance")}
				</Button>
			)}
			{error && (
				<p role="alert" className="text-red-700">
					{resolveErrorMessage(error, tRoot)}
				</p>
			)}
		</li>
	);
}
