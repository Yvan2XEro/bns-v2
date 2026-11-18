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
				<p className="font-bold text-ink">
					{address.label ?? address.recipientName}
				</p>
				{address.isDefault ? (
					<span className="rounded-full bg-brand-tint px-2 py-0.5 font-semibold text-[11px] text-brand">
						{t("default")}
					</span>
				) : null}
			</div>
			<p className="text-ink text-sm">
				{districtLabelOf(address)}, {cityLabel}
				{address.landmark ? ` — ${address.landmark}` : ""}
			</p>
			<p className="text-ink-muted text-sm">
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
		? "border-2 border-brand bg-brand-soft"
		: "border border-line bg-surface";
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
				<MapPin aria-hidden className="mt-0.5 h-5 w-5 shrink-0 text-brand" />
			)}
			<button
				type="button"
				className="min-w-0 flex-1 text-left disabled:opacity-60"
				disabled={disabled || !onSelect}
				onClick={onSelect}
			>
				<SavedAddressSummary address={address} cityLabel={cityLabel} />
				{disabledReason ? (
					<p className="mt-1 text-warn-ink-soft text-xs">{disabledReason}</p>
				) : null}
			</button>
			{actions ? <div className="flex shrink-0 gap-1">{actions}</div> : null}
		</div>
	);
}
