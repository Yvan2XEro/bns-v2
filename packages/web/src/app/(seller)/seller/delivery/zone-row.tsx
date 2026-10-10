"use client";

import { useTranslations } from "next-intl";
import { Button } from "~/components/ui/button";
import { useDisableZone } from "~/hooks/use-delivery-settings";
import { resolveErrorMessage } from "~/lib/apiError";
import { districtName } from "~/lib/delivery-zone-form";
import { formatXaf } from "~/lib/order-money";
import type { DeliveryZone } from "../../../../../../api/src/payload-types";

export function ZoneRow({
	shopId,
	zone,
	locale,
	onEdit,
}: {
	shopId: string;
	zone: DeliveryZone;
	locale: "fr" | "en";
	onEdit: () => void;
}) {
	const t = useTranslations("SellerDelivery");
	const tRoot = useTranslations();
	const disable = useDisableZone(shopId);
	const districts = (zone.districts ?? []).map((d) => districtName(d.key));
	const active = zone.active ?? true;

	return (
		<li className="space-y-2 rounded-2xl border border-[#E2E8F0] bg-white p-4">
			<div className="flex flex-wrap items-center justify-between gap-2">
				<p className="font-semibold text-[#0F172A]">
					{zone.name}{" "}
					<span className="font-normal text-[#64748B] text-sm">
						· {t(`method.${zone.method}`)}
					</span>
				</p>
				<span
					className={`rounded-full px-2.5 py-0.5 font-medium text-xs ${active ? "bg-[#DCFCE7] text-[#166534]" : "bg-[#F1F5F9] text-[#475569]"}`}
				>
					{active ? t("active") : t("inactive")}
				</span>
			</div>
			<dl className="grid gap-x-4 gap-y-1 text-[#334155] text-sm sm:grid-cols-2">
				<div>
					<dt className="inline text-[#64748B]">{t("columnDistricts")}: </dt>
					<dd className="inline">
						{districts.length > 0 ? districts.join(", ") : t("wholeCity")}
					</dd>
				</div>
				<div>
					<dt className="inline text-[#64748B]">{t("columnFee")}: </dt>
					<dd className="inline">{formatXaf(zone.fee, locale)}</dd>
				</div>
				<div>
					<dt className="inline text-[#64748B]">{t("columnFreeAbove")}: </dt>
					<dd className="inline">
						{zone.freeAboveSubtotal == null
							? "—"
							: formatXaf(zone.freeAboveSubtotal, locale)}
					</dd>
				</div>
				<div>
					<dt className="inline text-[#64748B]">{t("columnMinimum")}: </dt>
					<dd className="inline">
						{zone.minOrderSubtotal == null
							? "—"
							: formatXaf(zone.minOrderSubtotal, locale)}
					</dd>
				</div>
				<div>
					<dt className="inline text-[#64748B]">{t("columnEta")}: </dt>
					<dd className="inline">
						{t("etaHours", { min: zone.etaMinHours, max: zone.etaMaxHours })}
					</dd>
				</div>
				<div>
					<dt className="inline text-[#64748B]">{t("columnCod")}: </dt>
					<dd className="inline">
						{(zone.codAllowed ?? true) ? t("codYes") : t("codNo")}
					</dd>
				</div>
			</dl>
			{disable.isError && (
				<p role="alert" className="text-red-700 text-sm">
					{resolveErrorMessage(disable.error, tRoot)}
				</p>
			)}
			<div className="flex flex-wrap gap-2">
				<Button variant="outline" className="min-h-11" onClick={onEdit}>
					{t("edit")}
				</Button>
				{active && (
					<Button
						variant="outline"
						className="min-h-11"
						disabled={disable.isPending}
						onClick={() => disable.mutate(zone.id)}
					>
						{t("disable")}
					</Button>
				)}
			</div>
		</li>
	);
}
