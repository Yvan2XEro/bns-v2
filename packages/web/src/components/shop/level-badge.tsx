import { Check } from "lucide-react";
import { useTranslations } from "next-intl";
import { cn } from "~/lib/utils";

/** P1 only knows level 1. P2 adds the identity and business variants here. */
export function LevelBadge({
	level,
	size = "md",
	className,
}: {
	level: number | null | undefined;
	size?: "sm" | "md";
	className?: string;
}) {
	const t = useTranslations("Shop");
	if (!level || level < 1) return null;

	return (
		<span
			className={cn(
				"inline-flex items-center gap-1 whitespace-nowrap rounded-full bg-[#f1f5f9] font-semibold text-[#334155]",
				size === "sm" ? "px-2 py-0.5 text-[11px]" : "px-2.5 py-1 text-xs",
				className,
			)}
		>
			<Check
				aria-hidden="true"
				className={size === "sm" ? "h-3 w-3" : "h-3.5 w-3.5"}
			/>
			{t("levelPhone")}
		</span>
	);
}
