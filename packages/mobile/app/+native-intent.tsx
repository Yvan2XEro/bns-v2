import {
	APP_SCHEME,
	appPathFor,
	opensInApp,
} from "../../api/src/contracts/appLinks";

/**
 * Every link that opens the app — a website link (iOS Universal Links,
 * Android App Links) or `buynsellem://…` — passes here first, and lands on
 * the app's screen for that page. The website and the app share most paths;
 * the ones that differ are mapped once, in contracts/appLinks.ts.
 */
export function redirectSystemPath({
	path,
}: {
	path: string;
	initial: boolean;
}): string {
	try {
		const url = new URL(path, `${APP_SCHEME}://app`);
		if (url.protocol === "https:" || url.protocol === "http:") {
			// The OS only sends the paths the app declared; anything else goes home.
			return opensInApp(url.pathname)
				? appPathFor(url.pathname, url.search)
				: "/";
		}
		if (url.protocol === `${APP_SCHEME}:`) {
			// `buynsellem://listing/1` reads "listing" as the host.
			const pathname =
				url.host && url.host !== "app"
					? `/${url.host}${url.pathname === "/" ? "" : url.pathname}`
					: url.pathname;
			return appPathFor(pathname, url.search);
		}
		// Expo's own development links, and anything else: untouched.
		return path;
	} catch {
		return path;
	}
}
