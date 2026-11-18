"use client";

import { useTranslations } from "next-intl";
import { Label } from "~/components/ui/label";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "~/components/ui/select";
import { listingKindRules, type PriceUnit } from "~/lib/listing-kind";

/**
 * What the price covers — a month's rent, a night, an hourly rate. Shown only
 * when the ad's kind allows more than one unit; goods are always a one-off
 * price, and the form then sends no unit at all.
 */
export function PriceUnitSelect({
	kind,
	value,
	onChange,
}: {
	kind: string | null | undefined;
	value: PriceUnit;
	onChange: (unit: PriceUnit) => void;
}) {
	const t = useTranslations("ListingKind");
	const units = listingKindRules(kind).priceUnits;
	if (units.length < 2) return null;

	return (
		<div className="space-y-2">
			<Label htmlFor="price-unit">{t("unitLabel")}</Label>
			<Select
				value={units.includes(value) ? value : units[0]}
				onValueChange={(next) => {
					const unit = units.find((candidate) => candidate === next);
					if (unit) onChange(unit);
				}}
			>
				<SelectTrigger id="price-unit">
					<SelectValue />
				</SelectTrigger>
				<SelectContent>
					{units.map((unit) => (
						<SelectItem key={unit} value={unit}>
							{t(`unitOption.${unit}`)}
						</SelectItem>
					))}
				</SelectContent>
			</Select>
		</div>
	);
}

/** The unit to send with the ad, or nothing for a kind that has only one. */
export function priceUnitToSend(
	kind: string | null | undefined,
	unit: PriceUnit,
): PriceUnit | undefined {
	const units = listingKindRules(kind).priceUnits;
	return units.length > 1 && units.includes(unit) ? unit : undefined;
}
