import { useTranslations } from "next-intl";
import { Card, CardContent, CardHeader, CardTitle } from "~/components/ui/card";
import {
	CHECKLIST_ITEMS,
	type ChecklistState,
} from "~/lib/verification-decision";

/**
 * The five checks a level-3 reviewer confirms before approving. Real
 * `<button>` toggles (`aria-pressed`), not a bare styled `<div>`, so each item
 * is reachable and labelled without pulling in a switch primitive nobody
 * else in this codebase depends on yet.
 */
export function Checklist({
	value,
	onChange,
}: {
	value: ChecklistState;
	onChange: (next: ChecklistState) => void;
}) {
	const t = useTranslations("Moderation");

	return (
		<Card>
			<CardHeader>
				<CardTitle>{t("review.checklist.title")}</CardTitle>
			</CardHeader>
			<CardContent className="space-y-2">
				{CHECKLIST_ITEMS.map((item) => {
					const checked = value[item] === true;
					return (
						<button
							key={item}
							type="button"
							aria-pressed={checked}
							onClick={() => onChange({ ...value, [item]: !checked })}
							className="flex w-full items-center justify-between gap-3 rounded-xl border border-[#DBEAFE] px-3 py-2 text-left text-sm transition-colors hover:bg-[#F8FAFF]"
						>
							<span className="text-[#0F172A]">
								{t(`review.checklist.${item}`)}
							</span>
							<span
								className={
									checked
										? "flex h-5 w-9 items-center rounded-full bg-[#1E40AF] px-0.5"
										: "flex h-5 w-9 items-center rounded-full bg-[#E2E8F0] px-0.5"
								}
							>
								<span
									className={
										checked
											? "h-4 w-4 translate-x-4 rounded-full bg-white transition-transform"
											: "h-4 w-4 translate-x-0 rounded-full bg-white transition-transform"
									}
								/>
							</span>
						</button>
					);
				})}
			</CardContent>
		</Card>
	);
}
