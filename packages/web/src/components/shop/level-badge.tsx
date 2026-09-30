import { BadgeCheck, Building2, Check } from "lucide-react";
import { useTranslations } from "next-intl";
import { cn } from "~/lib/utils";
import { badgeLabelKey, type VerificationBadge } from "~/lib/verification";

const BADGE_ICONS = {
	phone: Check,
	identity: BadgeCheck,
	business: Building2,
} as const;

const BADGE_TONES = {
	phone: "bg-[#f1f5f9] text-[#334155]",
	identity: "bg-[#eff6ff] text-[#1e40af]",
	business: "bg-[#ecfdf5] text-[#047857]",
} as const;

export function LevelBadge({
	badge,
	size = "md",
	className,
}: {
	badge: VerificationBadge | null | undefined;
	size?: "sm" | "md";
	className?: string;
}) {
	const t = useTranslations("Shop");
	const labelKey = badgeLabelKey(badge);
	if (!badge || !labelKey) return null;

	const Icon = BADGE_ICONS[badge];

	return (
		<span
			className={cn(
				"inline-flex items-center gap-1 whitespace-nowrap rounded-full font-semibold",
				BADGE_TONES[badge],
				size === "sm" ? "px-2 py-0.5 text-[11px]" : "px-2.5 py-1 text-xs",
				className,
			)}
		>
			<Icon
				aria-hidden="true"
				className={size === "sm" ? "h-3 w-3" : "h-3.5 w-3.5"}
			/>
			{t(labelKey)}
		</span>
	);
}
