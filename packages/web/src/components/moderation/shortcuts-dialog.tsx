"use client";

import { useTranslations } from "next-intl";
import {
	Dialog,
	DialogContent,
	DialogHeader,
	DialogTitle,
} from "~/components/ui/dialog";

const KEYS = [
	{ keys: ["j", "↓"], label: "shortcuts.next" },
	{ keys: ["k", "↑"], label: "shortcuts.previous" },
	{ keys: ["n"], label: "shortcuts.takeNext" },
	{ keys: ["Esc"], label: "shortcuts.close" },
	{ keys: ["?"], label: "shortcuts.help" },
] as const;

/** The console's keys, shown with "?". */
export function ShortcutsDialog({
	open,
	onOpenChange,
}: {
	open: boolean;
	onOpenChange: (open: boolean) => void;
}) {
	const t = useTranslations("ModerationConsole");
	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent>
				<DialogHeader>
					<DialogTitle>{t("shortcuts.title")}</DialogTitle>
				</DialogHeader>
				<dl className="space-y-2 text-sm">
					{KEYS.map(({ keys, label }) => (
						<div
							key={label}
							className="flex items-center justify-between gap-4"
						>
							<dt className="text-ink">{t(label)}</dt>
							<dd className="flex gap-1">
								{keys.map((key) => (
									<kbd
										key={key}
										className="rounded border border-line-strong bg-subtle px-2 py-0.5 font-mono text-ink text-xs"
									>
										{key}
									</kbd>
								))}
							</dd>
						</div>
					))}
				</dl>
			</DialogContent>
		</Dialog>
	);
}
