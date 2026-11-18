export type ContentLocale = "fr" | "en";

export const DEFAULT_CONTENT_LOCALE: ContentLocale = "fr";

const asLocale = (value: string | null | undefined): ContentLocale | null => {
	const code = value?.trim().toLowerCase().split(/[-_]/)[0];
	return code === "fr" || code === "en" ? code : null;
};

/**
 * The language a request wants its localised labels in: `?locale=` first,
 * then the first supported `Accept-Language` entry by preference, then French.
 */
export function requestLocale(request: Request): ContentLocale {
	const fromQuery = asLocale(new URL(request.url).searchParams.get("locale"));
	if (fromQuery) return fromQuery;

	const header = request.headers.get("accept-language");
	if (header) {
		const ranked = header
			.split(",")
			.map((part, index) => {
				const [tag, ...params] = part.trim().split(";");
				const q = params
					.map((param) => param.trim())
					.find((param) => param.startsWith("q="));
				const weight = q ? Number(q.slice(2)) : 1;
				return {
					locale: asLocale(tag),
					weight: Number.isFinite(weight) ? weight : 0,
					index,
				};
			})
			.filter((entry) => entry.locale !== null && entry.weight > 0)
			.sort((a, b) => b.weight - a.weight || a.index - b.index);
		if (ranked[0]?.locale) return ranked[0].locale;
	}

	return DEFAULT_CONTENT_LOCALE;
}
