/**
 * Which website links the native app opens itself (iOS Universal Links,
 * Android App Links), and which screen each one lands on. A shop or a
 * listing shared on WhatsApp then opens in the app when it is installed, and
 * in the browser otherwise.
 *
 * Read by the website (the two association files it publishes, and its
 * "open in the app" banner) and by the app (`app/+native-intent.tsx`), so a
 * link the website hands over is always one the app can show.
 */

export const IOS_BUNDLE_ID = "com.buynsellem.mobile";
export const ANDROID_PACKAGE = "com.buynsellem.mobile";
/** The app's own scheme, for the "open in the app" button. */
export const APP_SCHEME = "buynsellem";

/**
 * Pages the app has a screen for. Sign-in, email confirmation, password reset,
 * payment and moderation stay on the website, which the app has no screen
 * for or hands back to the browser on purpose.
 */
export const APP_LINK_PREFIXES = [
	"/listing/",
	"/s/",
	"/profile/",
	"/invite/",
	"/purchases",
	"/returns/",
	"/disputes/",
	"/messages",
	"/search",
	"/favorites",
	"/cart",
] as const;

/** Whether the app has a screen for this website path. */
export function opensInApp(pathname: string): boolean {
	return APP_LINK_PREFIXES.some((prefix) =>
		prefix.endsWith("/")
			? pathname.startsWith(prefix)
			: pathname === prefix || pathname.startsWith(`${prefix}/`),
	);
}

/** The website's "my account" pages and their place in the app. */
const OWN_PROFILE: Record<string, string> = {
	"/profile/me": "/account",
	"/profile/me/listings": "/account/listings",
	"/profile/me/searches": "/account/searches",
	"/profile/me/boosts": "/account/boosts",
};

/**
 * Seller pages whose app screen has another path, or none: a notification
 * names the website's page, and the app opens its own (the seller hub when
 * it has no screen for it).
 */
const SELLER_PAGES: [RegExp, (match: RegExpMatchArray) => string][] = [
	[/^\/seller\/messages\/([^/]+)$/, (m) => `/seller/inbox/${m[1]}`],
	[/^\/seller\/messages$/, () => "/seller/inbox"],
	[
		/^\/seller\/catalogue\/([^/]+)(\/(variants|stock))?$/,
		(m) => `/seller/product/${m[1]}`,
	],
	[/^\/seller\/disputes\/([^/]+)$/, (m) => `/disputes/${m[1]}`],
	[/^\/seller\/disputes$/, () => "/seller"],
	[/^\/seller\/resale\/links(\/[^/]+)?$/, () => "/seller"],
];

/**
 * The app route for a website path and query. Most pages share their path;
 * the few that differ are mapped here, once.
 */
export function appPathFor(pathname: string, search = ""): string {
	const params = new URLSearchParams(search);
	const path = pathname.replace(/\/+$/, "") || "/";
	const own = OWN_PROFILE[path];
	if (own) return own;
	const shopConversation = params.get("conversation");
	if (path === "/seller/messages" && shopConversation) {
		return `/seller/inbox/${encodeURIComponent(shopConversation)}`;
	}
	for (const [pattern, toApp] of SELLER_PAGES) {
		const match = path.match(pattern);
		if (match) return toApp(match);
	}
	// The website opens a conversation with a query; the app has its own screen.
	const conversation = params.get("conversation");
	if (pathname === "/messages" && conversation) {
		return `/messages/${encodeURIComponent(conversation)}`;
	}
	const query = params.toString();
	return query ? `${pathname}?${query}` : pathname;
}

/** `/.well-known/apple-app-site-association`: the app may open these paths. */
export function appleAppSiteAssociation(teamId: string) {
	return {
		applinks: {
			details: [
				{
					appIDs: [`${teamId}.${IOS_BUNDLE_ID}`],
					components: APP_LINK_PREFIXES.flatMap((prefix) =>
						prefix.endsWith("/")
							? [{ "/": `${prefix}*` }]
							: [{ "/": prefix }, { "/": `${prefix}/*` }],
					),
				},
			],
		},
	};
}

/** `/.well-known/assetlinks.json`: the signed app may open this site's links. */
export function androidAssetLinks(sha256Fingerprints: readonly string[]) {
	return [
		{
			relation: ["delegate_permission/common.handle_all_urls"],
			target: {
				namespace: "android_app",
				package_name: ANDROID_PACKAGE,
				sha256_cert_fingerprints: [...sha256Fingerprints],
			},
		},
	];
}
