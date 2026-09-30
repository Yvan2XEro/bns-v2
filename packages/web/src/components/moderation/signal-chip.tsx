"use client";

import { useTranslations } from "next-intl";
import { signalToneKey } from "~/lib/moderation-verification";
import { cn } from "~/lib/utils";

const TONE_CLASSES: Record<string, string> = {
	positive: "border-transparent bg-emerald-50 text-emerald-700",
	negative: "border-transparent bg-red-50 text-red-700",
	warning: "border-transparent bg-[#FEF3C7] text-[#92400E]",
	neutral: "border-[#E2E8F0] bg-[#F8FAFC] text-[#475569]",
};

/**
 * One review signal, coloured by `signalToneKey`. Falls back to the raw code
 * for anything the API adds before this screen learns to translate it.
 */
export function SignalChip({ code }: { code: string }) {
	const t = useTranslations("Moderation");
	const tone = signalToneKey(code);
	const key = `signal.${code}`;

	let label = code;
	try {
		const translated = t(key);
		if (translated && translated !== key) label = translated;
	} catch {
		// Unrecognised signal code: show the raw code rather than crash.
	}

	return (
		<span
			className={cn(
				"inline-flex items-center whitespace-nowrap rounded-full border px-2 py-0.5 font-medium text-[11px]",
				TONE_CLASSES[tone],
			)}
		>
			{label}
		</span>
	);
}
