import { useTranslations } from "next-intl";
import { cn } from "~/lib/utils";

export type StatusChipKind = "active" | "draft" | "archived" | "low" | "out";

const STYLES: Record<StatusChipKind, string> = {
	active: "bg-[#dcfce7] text-[#166534]",
	draft: "bg-[#f1f5f9] text-[#475569]",
	archived: "bg-[#f1f5f9] text-[#475569]",
	low: "bg-[#fef3c7] text-[#92400e]",
	out: "bg-[#fee2e2] text-[#991b1b]",
};

export function StatusChip({
	kind,
	className,
}: {
	kind: StatusChipKind;
	className?: string;
}) {
	const t = useTranslations("Shop");
	return (
		<span
			className={cn(
				"inline-flex items-center whitespace-nowrap rounded-full px-2 py-0.5 font-semibold text-[11px]",
				STYLES[kind],
				className,
			)}
		>
			{t(`status.${kind}`)}
		</span>
	);
}
