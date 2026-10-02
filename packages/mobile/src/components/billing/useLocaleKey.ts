import { useTranslation } from "@/src/lib/i18n";

/** The two locales the money and date formatters and the API documents speak. */
export function useLocaleKey(): "fr" | "en" {
	const { i18n } = useTranslation();
	return i18n.language?.startsWith("en") ? "en" : "fr";
}
