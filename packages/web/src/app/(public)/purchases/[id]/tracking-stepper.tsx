"use client";

import { Check, X } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { formatDeliveryDate, type TrackingStep } from "~/lib/shipment-tracking";

const DOT: Record<TrackingStep["state"], string> = {
	done: "bg-brand text-white",
	current: "border-2 border-brand bg-surface text-brand",
	upcoming: "border border-line-strong bg-surface text-ink-faint",
	stopped: "bg-bad-soft text-bad-ink-soft",
};

/** The state is spoken as well as drawn: a colour alone says nothing to a screen reader. */
export function TrackingStepper({ steps }: { steps: TrackingStep[] }) {
	const t = useTranslations("Tracking");
	const locale = useLocale() === "en" ? "en" : "fr";
	return (
		<ol className="grid gap-2 sm:grid-cols-4">
			{steps.map((step) => (
				<li key={step.key} className="flex items-start gap-2 sm:flex-col">
					<span
						aria-hidden
						className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs ${DOT[step.state]}`}
					>
						{step.state === "done" && <Check className="h-4 w-4" />}
						{step.state === "stopped" && <X className="h-4 w-4" />}
					</span>
					<span>
						<span className="block font-medium text-ink text-sm">
							{t(`step.${step.key}`)}
							<span className="sr-only"> — {t(`state.${step.state}`)}</span>
						</span>
						{step.at && (
							<time dateTime={step.at} className="block text-ink-muted text-xs">
								{formatDeliveryDate(step.at, locale, true)}
							</time>
						)}
					</span>
				</li>
			))}
		</ol>
	);
}
