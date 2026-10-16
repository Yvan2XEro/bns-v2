"use client";

import { MapPin } from "lucide-react";
import { useTranslations } from "next-intl";
import type { ReactNode } from "react";
import { districtLabelOf, type SavedAddress } from "~/lib/saved-addresses";

/** One saved address: its label, the default tag, where and who. */
export function SavedAddressSummary({
	address,
	cityLabel,
}: {
	address: SavedAddress;
	cityLabel: string;
}) {
	const t = useTranslations("Addresses");
	return (
		<div className="min-w-0 space-y-0.5">
			<div className="flex flex-wrap items-center gap-2">
				<p className="font-bold text-[#0F172A]">
					{address.label ?? address.recipientName}
				</p>
				{address.isDefault ? (
					<span className="rounded-full bg-[#DBEAFE] px-2 py-0.5 font-semibold text-[#1E40AF] text-[11px]">
						{t("default")}
					</span>
				) : null}
			</div>
			<p className="text-[#0F172A] text-sm">
				{districtLabelOf(address)}, {cityLabel}
				{address.landmark ? ` — ${address.landmark}` : ""}
			</p>
			<p className="text-[#64748B] text-sm">
				{address.label ? `${address.recipientName} · ` : ""}
				{address.phone}
			</p>
		</div>
	);
}

export function SavedAddressCard({
	address,
	cityLabel,
	selected = false,
	disabledReason,
	onSelect,
	actions,
}: {
	address: SavedAddress;
	cityLabel: string;
	selected?: boolean;
	disabledReason?: string | null;
	onSelect?: () => void;
	actions?: ReactNode;
}) {
	const disabled = Boolean(disabledReason);
	const frame = selected
		? "border-2 border-[#1E40AF] bg-[#EFF6FF]"
		: "border border-[#E2E8F0] bg-white";
	return (
		<div className={`flex items-start gap-3 rounded-xl p-4 ${frame}`}>
			{onSelect ? (
				<input
					type="radio"
					name="saved-address"
					aria-label={address.label ?? address.recipientName}
					className="mt-1 h-4 w-4 shrink-0"
					checked={selected}
					disabled={disabled}
					onChange={onSelect}
				/>
			) : (
				<MapPin
					aria-hidden
					className="mt-0.5 h-5 w-5 shrink-0 text-[#1E40AF]"
				/>
			)}
			<button
				type="button"
				className="min-w-0 flex-1 text-left disabled:opacity-60"
				disabled={disabled || !onSelect}
				onClick={onSelect}
			>
				<SavedAddressSummary address={address} cityLabel={cityLabel} />
				{disabledReason ? (
					<p className="mt-1 text-[#B45309] text-xs">{disabledReason}</p>
				) : null}
			</button>
			{actions ? <div className="flex shrink-0 gap-1">{actions}</div> : null}
		</div>
	);
}
