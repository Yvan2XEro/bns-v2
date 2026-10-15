"use client";

import { Globe } from "lucide-react";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { useTransition } from "react";
import { isLocale, LOCALE_NAMES, LOCALES } from "~/i18n/locales";
import { cn } from "~/lib/utils";

export function LocaleSwitcher({
	tone = "light",
	className,
}: {
	tone?: "light" | "dark";
	className?: string;
}) {
	const locale = useLocale();
	const t = useTranslations("LocaleSwitcher");
	const router = useRouter();
	const [isPending, startTransition] = useTransition();

	function change(next: string) {
		if (!isLocale(next) || next === locale) return;
		document.cookie = `NEXT_LOCALE=${next};path=/;max-age=${60 * 60 * 24 * 365}`;
		startTransition(() => router.refresh());
	}

	return (
		<label
			className={cn(
				"relative flex h-9 items-center gap-1.5 rounded-lg px-2 text-xs transition-colors focus-within:ring-2 focus-within:ring-[#93C5FD]",
				tone === "dark"
					? "text-[#CBD5E1] hover:bg-white/5 hover:text-white"
					: "text-[#475569] hover:bg-[#F1F5F9] hover:text-[#0F172A]",
				className,
			)}
		>
			<Globe aria-hidden="true" className="h-4 w-4 shrink-0" />
			<span className="sr-only">{t("label")}</span>
			<select
				value={locale}
				onChange={(event) => change(event.target.value)}
				disabled={isPending}
				className="cursor-pointer appearance-none bg-transparent pr-1 font-medium outline-none disabled:opacity-50"
			>
				{LOCALES.map((code) => (
					<option
						key={code}
						value={code}
						lang={code}
						className="text-[#0F172A]"
					>
						{LOCALE_NAMES[code]}
					</option>
				))}
			</select>
		</label>
	);
}
