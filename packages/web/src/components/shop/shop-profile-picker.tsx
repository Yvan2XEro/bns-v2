"use client";

import {
	Briefcase,
	Building2,
	type LucideIcon,
	Store,
	Wrench,
} from "lucide-react";
import { useTranslations } from "next-intl";
import { SHOP_PROFILES, type ShopProfile } from "~/lib/shop-profile";
import { cn } from "~/lib/utils";

const ICONS: Record<ShopProfile, LucideIcon> = {
	store: Store,
	agency: Building2,
	employer: Briefcase,
	provider: Wrench,
};

/**
 * The kind of business, as four cards: a shop, an agency, a recruiter or a
 * service provider. A radio group, so the keyboard moves through it like one.
 */
export function ShopProfilePicker({
	value,
	onChange,
	disabled = false,
	name = "shop-profile",
}: {
	value: ShopProfile;
	onChange: (profile: ShopProfile) => void;
	disabled?: boolean;
	name?: string;
}) {
	const t = useTranslations("ShopProfile");

	return (
		<div className="grid gap-2 sm:grid-cols-2">
			{SHOP_PROFILES.map((profile) => {
				const Icon = ICONS[profile];
				const checked = value === profile;
				return (
					<label
						key={profile}
						className={cn(
							"flex cursor-pointer gap-3 rounded-xl border p-3 transition-colors has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-[var(--shop-accent,var(--c-brand))]",
							checked
								? "border-[var(--shop-accent,var(--c-brand))] bg-[var(--shop-accent-soft,var(--c-brand-soft))]"
								: "border-line bg-surface hover:border-[var(--shop-accent-border,var(--c-brand-line))]",
							disabled && "cursor-not-allowed opacity-60",
						)}
					>
						<input
							type="radio"
							name={name}
							value={profile}
							checked={checked}
							disabled={disabled}
							onChange={() => onChange(profile)}
							className="sr-only"
						/>
						<Icon
							aria-hidden="true"
							className={cn(
								"mt-0.5 h-5 w-5 shrink-0",
								checked
									? "text-[var(--shop-accent-text,var(--c-brand))]"
									: "text-ink-muted",
							)}
						/>
						<span className="min-w-0">
							<span className="block font-semibold text-ink text-sm">
								{t(`name.${profile}`)}
							</span>
							<span className="block text-ink-muted text-xs">
								{t(`description.${profile}`)}
							</span>
						</span>
					</label>
				);
			})}
		</div>
	);
}
