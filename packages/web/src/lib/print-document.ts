import { getLocale } from "next-intl/server";
import { serverFetch } from "~/lib/server-api";

/** The flags every printable document takes, passed through as they are. */
const PASSED = ["autoprint", "embed", "blind"] as const;

/**
 * A printable document from the API, answered as the site's own page: the
 * API renders it (one self-contained HTML file, designed for paper) and the
 * same document serves the app, which fetches it with its token. Fetched
 * here with the visitor's session, so a new tab never lands on a bare 401.
 */
export async function printDocumentResponse(
	request: Request,
	apiPath: string,
): Promise<Response> {
	const incoming = new URL(request.url).searchParams;
	const query = new URLSearchParams({
		lang: (await getLocale()) === "en" ? "en" : "fr",
	});
	for (const key of PASSED) {
		const value = incoming.get(key);
		if (value === "1" || value === "0") query.set(key, value);
	}
	const response = await serverFetch(`${apiPath}?${query}`, {
		headers: { Accept: "text/html" },
	});
	if (response.status === 401) {
		const login = new URL("/auth/login", request.url);
		login.searchParams.set(
			"redirect",
			new URL(request.url).pathname + new URL(request.url).search,
		);
		return Response.redirect(login, 302);
	}
	return new Response(await response.text(), {
		status: response.status,
		headers: {
			"content-type":
				response.headers.get("content-type") ?? "text/html; charset=utf-8",
			"cache-control": "private, no-store",
		},
	});
}
