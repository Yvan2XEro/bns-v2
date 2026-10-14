"use client";

import { Check, Clock, MapPin, TrendingUp } from "lucide-react";
import { useTranslations } from "next-intl";
import type { ReactNode } from "react";
import { cn } from "~/lib/utils";
import {
	type Place,
	type PlacePickerSection,
	placeContext,
} from "../../../../api/src/contracts/places";

type SectionKey = PlacePickerSection["key"];

const SECTION_LABEL = {
	recent: "recent",
	popular: "popular",
	results: "results",
} as const satisfies Record<SectionKey, string>;

export function SectionTitle({
	id,
	section,
}: {
	id: string;
	section: SectionKey;
}) {
	const t = useTranslations("LocationPicker");
	return (
		<h3
			id={id}
			className="px-2 pt-5 pb-1.5 font-semibold text-[#64748B] text-xs uppercase tracking-wider"
		>
			{t(SECTION_LABEL[section])}
		</h3>
	);
}

const rowClass =
	"flex min-h-14 w-full items-center gap-3 rounded-2xl px-2 py-2 text-left transition-colors hover:bg-[#F1F5F9] focus-visible:bg-[#F1F5F9] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1E40AF] disabled:opacity-70";

const TONES = {
	primary: { icon: "bg-[#DBEAFE] text-[#1E40AF]", label: "text-[#1E40AF]" },
	warning: { icon: "bg-[#FEF3C7] text-[#92400E]", label: "text-[#92400E]" },
	neutral: { icon: "bg-[#F1F5F9] text-[#0F172A]", label: "text-[#0F172A]" },
} as const;

export function ActionRow({
	icon,
	label,
	hint,
	tone = "primary",
	selected,
	disabled,
	onClick,
}: {
	icon: ReactNode;
	label: string;
	hint?: string;
	tone?: keyof typeof TONES;
	selected?: boolean;
	disabled?: boolean;
	onClick: () => void;
}) {
	return (
		<button
			type="button"
			onClick={onClick}
			disabled={disabled}
			aria-pressed={selected}
			className={rowClass}
		>
			<span
				className={cn(
					"flex h-10 w-10 shrink-0 items-center justify-center rounded-full",
					TONES[tone].icon,
				)}
			>
				{icon}
			</span>
			<span className="min-w-0 flex-1">
				<span
					className={cn(
						"block truncate font-semibold text-[15px]",
						TONES[tone].label,
					)}
				>
					{label}
				</span>
				{hint ? (
					<span className="block text-[#64748B] text-[13px]" aria-live="polite">
						{hint}
					</span>
				) : null}
			</span>
			{selected ? <Check className="h-5 w-5 shrink-0 text-[#1E40AF]" /> : null}
		</button>
	);
}

const SECTION_ICON = { recent: Clock, popular: TrendingUp, results: MapPin };

export function PlaceRow({
	place,
	section,
	selected,
	onClick,
}: {
	place: Place & { listings?: number };
	section: SectionKey;
	selected: boolean;
	onClick: () => void;
}) {
	const t = useTranslations("LocationPicker");
	const Icon = SECTION_ICON[section];
	const context =
		typeof place.listings === "number"
			? t("listingsCount", { count: place.listings })
			: placeContext(place);
	return (
		<button
			type="button"
			onClick={onClick}
			aria-pressed={selected}
			className={rowClass}
		>
			<span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#F1F5F9] text-[#64748B]">
				<Icon className="h-[18px] w-[18px]" />
			</span>
			<span className="min-w-0 flex-1">
				<span className="block truncate font-semibold text-[#0F172A] text-[15px]">
					{place.district ?? place.name}
				</span>
				{context ? (
					<span className="block truncate text-[#64748B] text-[13px]">
						{context}
					</span>
				) : null}
			</span>
			{selected ? <Check className="h-5 w-5 shrink-0 text-[#1E40AF]" /> : null}
		</button>
	);
}
