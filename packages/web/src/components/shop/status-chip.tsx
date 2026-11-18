import { useTranslations } from "next-intl";
import { cn } from "~/lib/utils";

export type StatusChipKind = "active" | "draft" | "archived" | "low" | "out";

const STYLES: Record<StatusChipKind, string> = {
	active: "bg-ok-soft text-ok-ink",
	draft: "bg-subtle text-ink-mid",
	archived: "bg-subtle text-ink-mid",
	low: "bg-warn-soft text-warn-ink",
	out: "bg-bad-soft text-bad-ink",
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
