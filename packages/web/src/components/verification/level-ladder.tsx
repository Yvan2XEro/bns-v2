import { Check, Lock } from "lucide-react";
import { useTranslations } from "next-intl";
import { LevelBadge } from "~/components/shop/level-badge";
import { cn } from "~/lib/utils";
import {
	badgeForLevel,
	CAPABILITY_UNLOCKS,
	levelLadder,
	type ShopCapabilities,
} from "~/lib/verification";

const RUNG_STYLES = {
	reached: "border-brand-tint bg-brand-soft",
	current: "border-brand-line bg-surface shadow-sm",
	locked: "border-line bg-canvas",
} as const;

/**
 * The three-rung ladder every seller sees, whatever the feature flag says:
 * this is a read of the shop's own capabilities, never an action.
 */
export function LevelLadder({
	capabilities,
}: {
	capabilities: ShopCapabilities;
}) {
	const t = useTranslations("Verification");
	const rungs = levelLadder(capabilities);

	return (
		<div className="rounded-2xl border border-brand-tint bg-surface p-5">
			<h2 className="font-bold text-ink text-lg">{t("ladder.title")}</h2>
			<ol className="mt-4 space-y-3">
				{rungs.map((rung) => {
					const unlocks =
						rung.level === 1 ? [] : (CAPABILITY_UNLOCKS[rung.level] ?? []);
					return (
						<li
							key={rung.level}
							className={cn(
								"flex items-start gap-3 rounded-xl border p-4",
								RUNG_STYLES[rung.state],
							)}
						>
							<span
								className={cn(
									"mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full",
									rung.state === "locked"
										? "bg-line text-ink-faint"
										: "bg-brand text-white",
								)}
							>
								{rung.state === "locked" ? (
									<Lock aria-hidden="true" className="h-3.5 w-3.5" />
								) : (
									<Check aria-hidden="true" className="h-3.5 w-3.5" />
								)}
							</span>
							<div className="min-w-0 flex-1">
								<div className="flex flex-wrap items-center gap-2">
									<LevelBadge badge={badgeForLevel(rung.level)} size="sm" />
									<span className="font-semibold text-ink text-sm">
										{t(`ladder.state.${rung.state}`)}
									</span>
								</div>
								{unlocks.length > 0 && (
									<ul className="mt-2 space-y-1 text-ink-mid text-sm">
										{unlocks.map((capability) => (
											<li key={capability}>{t(`unlocks.${capability}`)}</li>
										))}
									</ul>
								)}
							</div>
						</li>
					);
				})}
			</ol>
		</div>
	);
}
