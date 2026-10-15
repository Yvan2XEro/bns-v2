"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import { useCourierStats } from "~/hooks/use-delivery-settings";
import { useOrderMoney } from "~/hooks/use-order-money";
import { useLocaleKey } from "~/lib/use-locale-key";
import type { DeliveryZone } from "../../../../../../api/src/payload-types";

/**
 * Which zones hand their runs to a partner courier, and how this month's
 * runs went. Choosing the courier stays in each zone's form; the registry
 * keeps its own page.
 */
export function CourierCard({
	shopId,
	zones,
}: {
	shopId: string;
	zones: readonly DeliveryZone[];
}) {
	const formatOrderMoney = useOrderMoney();
	const tPage = useTranslations("DeliveryPage");
	const locale = useLocaleKey();
	const stats = useCourierStats(shopId);
	const courierZones = zones.filter(
		(zone) => zone.method === "courier" && (zone.active ?? true),
	);

	return (
		<section
			aria-labelledby="courier-card-title"
			className="overflow-hidden rounded-2xl border border-[#E2E8F0] bg-white"
		>
			<h2
				id="courier-card-title"
				className="border-[#F1F5F9] border-b px-[18px] py-3.5 font-bold text-[#0F172A] text-base"
			>
				{tPage("courierTitle")}
			</h2>
			<div className="space-y-3 px-[18px] py-3.5">
				<div>
					<p className="font-semibold text-[#0F172A]">{tPage("courierLead")}</p>
					<p className="text-[#64748B] text-[13px]">
						{courierZones.length > 0
							? tPage("courierActiveFor", {
									zones: courierZones.map((zone) => zone.name).join(", "),
								})
							: tPage("courierNone")}
					</p>
				</div>
				<p className="rounded-[10px] bg-[#F8FAFC] p-3 text-[#475569] text-xs leading-[17px]">
					{tPage("courierNote")}
				</p>
				{stats.isSuccess && (
					<dl className="space-y-2 text-sm">
						{stats.data.averageCourierCost !== null && (
							<div className="flex justify-between gap-3">
								<dt className="text-[#64748B]">{tPage("courierAverage")}</dt>
								<dd className="font-semibold text-[#0F172A] tabular-nums">
									{formatOrderMoney(stats.data.averageCourierCost, locale)}
								</dd>
							</div>
						)}
						<div className="flex justify-between gap-3">
							<dt className="text-[#64748B]">{tPage("courierRuns")}</dt>
							<dd className="font-semibold text-[#0F172A] tabular-nums">
								{stats.data.runs}
							</dd>
						</div>
						<div className="flex justify-between gap-3">
							<dt className="text-[#64748B]">{tPage("courierHandovers")}</dt>
							<dd
								className={`font-semibold tabular-nums ${stats.data.finished > 0 && stats.data.delivered === stats.data.finished ? "text-[#15803D]" : "text-[#0F172A]"}`}
							>
								{tPage("courierHandoversValue", {
									delivered: stats.data.delivered,
									finished: stats.data.finished,
								})}
							</dd>
						</div>
					</dl>
				)}
				<Link
					href="/seller/delivery/couriers"
					className="inline-flex font-semibold text-[#1E40AF] text-[13px] hover:underline"
				>
					{tPage("courierRegistry")}
				</Link>
			</div>
		</section>
	);
}
