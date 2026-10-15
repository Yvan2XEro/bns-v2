import { cookies } from "next/headers";
import { getRequestConfig } from "next-intl/server";

import { DEFAULT_LOCALE, isLocale, type Locale } from "./locales";

export { DEFAULT_LOCALE, type Locale };

export default getRequestConfig(async () => {
	const cookieStore = await cookies();
	const raw = cookieStore.get("NEXT_LOCALE")?.value ?? DEFAULT_LOCALE;
	const locale: Locale = isLocale(raw) ? raw : DEFAULT_LOCALE;

	return {
		locale,
		messages: (await import(`../../messages/${locale}.json`)).default,
	};
});
