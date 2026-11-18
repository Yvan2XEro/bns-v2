/** The results page a buyer last looked at, for "Back to results". */
const KEY = "bns.lastSearch";

export function rememberSearch(href: string) {
	try {
		window.sessionStorage.setItem(KEY, href);
	} catch {
		// Storage blocked: the link falls back to /search.
	}
}

export function lastSearchHref(): string {
	try {
		const href = window.sessionStorage.getItem(KEY);
		return href?.startsWith("/search") ? href : "/search";
	} catch {
		return "/search";
	}
}
