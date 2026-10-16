"use client";

import { Monitor, Moon, Sun } from "lucide-react";
import { useTranslations } from "next-intl";
import { useTheme } from "~/hooks/use-theme";
import { THEME_PREFERENCES, type ThemePreference } from "~/lib/theme";
import { cn } from "~/lib/utils";

const ICONS: Record<ThemePreference, typeof Sun> = {
	system: Monitor,
	light: Sun,
	dark: Moon,
};

/** Light, dark or the system's: a three-way switch next to the language one. */
export function ThemeSwitcher({
	tone = "light",
	className,
}: {
	tone?: "light" | "dark";
	className?: string;
}) {
	const t = useTranslations("ThemeSwitcher");
	const { preference, setPreference } = useTheme();
	return (
		<fieldset
			className={cn(
				"flex items-center gap-0.5 rounded-lg p-0.5",
				tone === "dark" ? "bg-white/5" : "bg-subtle",
				className,
			)}
		>
			<legend className="sr-only">{t("label")}</legend>
			{THEME_PREFERENCES.map((option) => {
				const Icon = ICONS[option];
				const active = preference === option;
				return (
					<label
						key={option}
						title={t(option)}
						className={cn(
							"flex h-6 w-7 cursor-pointer items-center justify-center rounded-md transition-colors focus-within:ring-2 focus-within:ring-brand-line",
							tone === "dark"
								? active
									? "bg-white/15 text-white"
									: "text-[#94A3B8] hover:text-white"
								: active
									? "bg-surface text-ink shadow-sm"
									: "text-ink-muted hover:text-ink",
						)}
					>
						<input
							type="radio"
							name="theme"
							value={option}
							checked={active}
							onChange={() => setPreference(option)}
							className="sr-only"
						/>
						<Icon aria-hidden="true" className="h-3.5 w-3.5" />
						<span className="sr-only">{t(option)}</span>
					</label>
				);
			})}
		</fieldset>
	);
}
