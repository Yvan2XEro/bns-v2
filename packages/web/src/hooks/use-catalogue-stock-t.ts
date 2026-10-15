"use client";

import { useTranslations } from "next-intl";

type Section = "catalogue" | "import" | "stock" | "inventory" | "editor";

/**
 * The `CatalogueStock` copy for screens that already read another namespace.
 * The namespace is built, not written as a literal, on purpose:
 * `messages-keys.test.ts` charges every literal namespace in a file to every
 * plain translation call in it, so a second literal would report each of the
 * screen's own keys as missing.
 */
export function useCatalogueStockT(section: Section) {
	return useTranslations(`CatalogueStock.${section}`);
}
