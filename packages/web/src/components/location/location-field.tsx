"use client";

import { ChevronDown, MapPin, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { usePlacePreferences } from "~/hooks/use-place-preferences";
import { cn } from "~/lib/utils";
import {
	formatPlaceLabel,
	type Place,
} from "../../../../api/src/contracts/places";
import { LocationDialog } from "./location-dialog";

interface LocationFieldProps {
	/** Set it when a <label htmlFor> points at the trigger. */
	id?: string;
	/** The stored city name, or the full place when the form keeps one. */
	value: string | Place | null;
	onChange: (place: Place | null) => void;
	placeholder?: string;
	title?: string;
	/** Hidden for a required field: there is nothing to go back to. */
	clearable?: boolean;
	variant?: "default" | "hero" | "bar";
	/**
	 * Scopes browsing rather than filling a form: empty reads "All cities",
	 * which the picker offers as its own choice.
	 */
	browse?: boolean;
	className?: string;
	invalid?: boolean;
}

/** A form field that opens the place picker. */
export function LocationField({
	id,
	value,
	onChange,
	placeholder,
	title,
	clearable: clearableProp = true,
	variant = "default",
	browse = false,
	className,
	invalid,
}: LocationFieldProps) {
	const t = useTranslations("LocationPicker");
	const [open, setOpen] = useState(false);
	const { place: myPlace, remember, selectPlace } = usePlacePreferences();
	const selected: Place | null =
		typeof value === "string"
			? value
				? { name: value, region: "", source: "saved" }
				: null
			: value;
	const label = selected ? formatPlaceLabel(selected) : "";
	const isHero = variant === "hero";
	const clearable = clearableProp && !browse;
	const fallback = browse ? t("allCities") : (placeholder ?? t("placeholder"));

	const handleSelect = (place: Place) => {
		onChange(place);
		if (browse) return;
		// The first city someone picks pre-fills the next form; one they chose
		// on purpose is never overwritten by a form.
		if (myPlace) remember(place);
		else selectPlace(place);
	};

	return (
		<div className={cn("relative", className)}>
			<button
				id={id}
				type="button"
				onClick={() => setOpen(true)}
				aria-haspopup="dialog"
				aria-invalid={invalid || undefined}
				className={cn(
					"flex w-full items-center gap-2 text-left text-sm transition-colors focus-visible:outline-none",
					isHero
						? "h-14 rounded-[22px] bg-transparent px-4 text-[#0F172A] hover:bg-[#F8FAFC] focus-visible:ring-2 focus-visible:ring-[#1E40AF]/30 sm:h-[62px]"
						: variant === "bar"
							? "h-full bg-transparent px-3 font-medium text-[#334155] hover:bg-[#F8FAFC] focus-visible:ring-2 focus-visible:ring-[#1E40AF]/30 focus-visible:ring-inset"
							: "h-10 rounded-lg border border-[#E2E8F0] bg-white px-3 hover:border-[#94A3B8] focus-visible:border-[#1E40AF] focus-visible:ring-2 focus-visible:ring-[#1E40AF]/20",
					invalid && !isHero && "border-[#DC2626]",
				)}
			>
				<span
					className={cn(
						"flex shrink-0 items-center justify-center rounded-full",
						isHero ? "h-8 w-8 bg-[#EFF6FF] text-[#2563EB]" : "text-[#94A3B8]",
					)}
				>
					<MapPin className="h-4 w-4" />
				</span>
				<span
					className={cn(
						"min-w-0 flex-1 truncate",
						label || browse ? "text-[#0F172A]" : "text-[#94A3B8]",
						isHero && label && "font-medium",
						clearable && label && "pr-6",
					)}
				>
					{label || fallback}
				</span>
				{clearable && label ? null : (
					<ChevronDown className="h-4 w-4 shrink-0 text-[#94A3B8]" />
				)}
			</button>
			{clearable && label ? (
				<button
					type="button"
					onClick={() => onChange(null)}
					aria-label={t("clear")}
					className="-translate-y-1/2 absolute top-1/2 right-2 flex h-7 w-7 items-center justify-center rounded-full text-[#94A3B8] hover:bg-[#F1F5F9] hover:text-[#0F172A] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1E40AF]"
				>
					<X className="h-4 w-4" />
				</button>
			) : null}
			<LocationDialog
				open={open}
				onOpenChange={setOpen}
				onSelect={handleSelect}
				title={title ?? (browse ? t("browseTitle") : undefined)}
				selected={selected}
				{...(browse
					? { onSelectAll: () => onChange(null), allSelected: !selected }
					: {})}
			/>
		</div>
	);
}
