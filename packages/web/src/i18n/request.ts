import { cookies } from "next/headers";
import { getRequestConfig } from "next-intl/server";

const LOCALES = ["fr", "en"] as const;
export type Locale = (typeof LOCALES)[number];
export const DEFAULT_LOCALE: Locale = "fr";

export default getRequestConfig(async () => {
	const cookieStore = await cookies();
	const raw = cookieStore.get("NEXT_LOCALE")?.value ?? DEFAULT_LOCALE;
	const locale: Locale = (LOCALES as readonly string[]).includes(raw)
		? (raw as Locale)
		: DEFAULT_LOCALE;

	return {
		locale,
		messages: (await import(`../../messages/${locale}.json`)).default,
	};
});
