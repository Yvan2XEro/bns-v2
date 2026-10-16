"use client";

import { useTranslations } from "next-intl";
import { MOVEMENT_TYPES } from "~/lib/stock";
import { cn } from "~/lib/utils";
import type { ClientMovementType } from "~/types";

/** The reason the movement is recorded under; it also decides the sign. */
export function MovementTypePicker({
	value,
	onChange,
}: {
	value: ClientMovementType;
	onChange: (type: ClientMovementType) => void;
}) {
	const t = useTranslations("Stock");

	return (
		<fieldset className="grid grid-cols-2 gap-2">
			<legend className="sr-only">{t("movementType")}</legend>
			{MOVEMENT_TYPES.map((type) => (
				<button
					key={type}
					type="button"
					aria-pressed={value === type}
					onClick={() => onChange(type)}
					className={cn(
						"rounded-lg border p-3 text-left",
						value === type
							? "border-[var(--shop-accent,var(--c-brand))] bg-[var(--shop-accent-soft,var(--c-brand-soft))]"
							: "border-line",
					)}
				>
					<span className="block font-semibold text-ink text-sm">
						{t(`types.${type}.title`)}
					</span>
					<span className="block text-ink-muted text-xs">
						{t(`types.${type}.hint`)}
					</span>
				</button>
			))}
		</fieldset>
	);
}
