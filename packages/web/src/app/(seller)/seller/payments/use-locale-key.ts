"use client";

import { useLocale } from "next-intl";

/** The two locales the money and date formatters speak. */
export function useLocaleKey(): "fr" | "en" {
	return useLocale() === "en" ? "en" : "fr";
}
