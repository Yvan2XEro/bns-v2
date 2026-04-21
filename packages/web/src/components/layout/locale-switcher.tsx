"use client";

import { useRouter } from "next/navigation";
import { useLocale } from "next-intl";
import { useTransition } from "react";

export function LocaleSwitcher() {
	const locale = useLocale();
	const router = useRouter();
	const [isPending, startTransition] = useTransition();

	const next = locale === "fr" ? "en" : "fr";

	function toggle() {
		document.cookie = `NEXT_LOCALE=${next};path=/;max-age=${60 * 60 * 24 * 365}`;
		startTransition(() => router.refresh());
	}

	return (
		<button
			type="button"
			onClick={toggle}
			disabled={isPending}
			className="flex h-9 items-center gap-1 rounded-lg px-2 font-medium text-[#475569] text-xs transition-colors hover:bg-[#F1F5F9] hover:text-[#0F172A] disabled:opacity-50"
			aria-label={`Switch to ${next.toUpperCase()}`}
		>
			<span className={locale === "fr" ? "font-bold text-[#1E40AF]" : ""}>
				FR
			</span>
			<span className="text-[#CBD5E1]">/</span>
			<span className={locale === "en" ? "font-bold text-[#1E40AF]" : ""}>
				EN
			</span>
		</button>
	);
}
