"use client";

import { MoreVertical } from "lucide-react";
import { useTranslations } from "next-intl";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "~/components/ui/dropdown-menu";
import { useOrderMoney } from "~/hooks/use-order-money";
import { chipsWithMore } from "~/lib/delivery-overview";
import { districtName } from "~/lib/delivery-zone-form";
import { cn } from "~/lib/utils";
import type { DeliveryZone } from "../../../../../../api/src/payload-types";

export function ZoneRow({
	zone,
	cityLabel,
	courierName,
	locale,
	selected,
	disabling,
	onEdit,
	onDisable,
}: {
	zone: DeliveryZone;
	cityLabel: string;
	courierName: string | null;
	locale: "fr" | "en";
	selected: boolean;
	disabling: boolean;
	onEdit: () => void;
	onDisable: () => void;
}) {
	const formatOrderMoney = useOrderMoney();
	const tDelivery = useTranslations("SellerDelivery");
	const tPage = useTranslations("DeliveryPage");
	const districts = (zone.districts ?? []).map((d) => districtName(d.key));
	const { visible, more } = chipsWithMore(districts);
	const active = zone.active ?? true;

	return (
		<tr className={cn(selected && "bg-[#EFF6FF]", !active && "opacity-70")}>
			<td className="whitespace-nowrap px-[18px] py-3 align-top">
				<button
					type="button"
					onClick={onEdit}
					className="text-left font-semibold text-[#0F172A] hover:text-[#1E40AF] hover:underline"
				>
					{zone.name}
				</button>
				<p className="text-[#64748B] text-xs">
					{cityLabel}
					{!active && ` · ${tDelivery("inactive")}`}
				</p>
			</td>
			<td className="max-w-[230px] px-3 py-3 align-top">
				<div className="flex flex-wrap gap-1">
					{visible.length === 0 ? (
						<span className="rounded-md bg-[#F1F5F9] px-[7px] py-0.5 text-[#334155] text-xs">
							{tDelivery("wholeCity")}
						</span>
					) : (
						visible.map((name) => (
							<span
								key={name}
								className="rounded-md bg-[#F1F5F9] px-[7px] py-0.5 text-[#334155] text-xs"
							>
								{name}
							</span>
						))
					)}
					{more > 0 && (
						<span className="px-0.5 py-0.5 text-[#64748B] text-xs">
							+{more}
						</span>
					)}
				</div>
			</td>
			<td
				className={cn(
					"whitespace-nowrap px-3 py-3 align-top font-bold tabular-nums",
					zone.fee === 0 ? "text-[#15803D]" : "text-[#0F172A]",
				)}
			>
				{zone.fee === 0 ? tPage("free") : formatOrderMoney(zone.fee, locale)}
				{zone.minOrderSubtotal != null && (
					<p className="font-normal text-[#64748B] text-xs">
						{tDelivery("columnMinimum")}{" "}
						{formatOrderMoney(zone.minOrderSubtotal, locale)}
					</p>
				)}
			</td>
			<td className="whitespace-nowrap px-3 py-3 align-top tabular-nums">
				{zone.freeAboveSubtotal == null
					? "—"
					: formatOrderMoney(zone.freeAboveSubtotal, locale)}
			</td>
			<td className="whitespace-nowrap px-3 py-3 align-top">
				{tDelivery("etaHours", {
					min: zone.etaMinHours,
					max: zone.etaMaxHours,
				})}
			</td>
			<td className="px-3 py-3 align-top">
				<span
					className={cn(
						"inline-flex rounded-full px-2.5 py-0.5 font-semibold text-xs",
						zone.method === "courier"
							? "bg-[#ECFEFF] text-[#155E75]"
							: "bg-[#F1F5F9] text-[#334155]",
					)}
				>
					{zone.method === "courier" && courierName
						? courierName
						: tDelivery(`method.${zone.method}`)}
				</span>
				{!(zone.codAllowed ?? true) && (
					<p className="mt-1 text-[#64748B] text-xs">{tDelivery("codNo")}</p>
				)}
			</td>
			<td className="px-[18px] py-3 text-right align-top">
				<DropdownMenu>
					<DropdownMenuTrigger asChild>
						<button
							type="button"
							aria-label={tPage("zoneActions", { name: zone.name })}
							className="rounded-lg p-1.5 hover:bg-[#F1F5F9]"
						>
							<MoreVertical
								aria-hidden="true"
								className="h-4 w-4 text-[#64748B]"
							/>
						</button>
					</DropdownMenuTrigger>
					<DropdownMenuContent align="end">
						<DropdownMenuItem onSelect={onEdit}>
							{tDelivery("edit")}
						</DropdownMenuItem>
						{active && (
							<DropdownMenuItem disabled={disabling} onSelect={onDisable}>
								{tDelivery("disable")}
							</DropdownMenuItem>
						)}
					</DropdownMenuContent>
				</DropdownMenu>
			</td>
		</tr>
	);
}
