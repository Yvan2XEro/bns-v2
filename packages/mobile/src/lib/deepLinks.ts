/**
 * The ways a link can name a screen of this app: a bare path (what
 * `buildExpoPushData` on the API puts in a push's `data.url`) or the app's
 * own scheme (`app.json`'s `scheme`), which an SMS, an email or the web hands
 * to the OS.
 */
export const APP_LINK_PREFIXES = ["buynsellem://"] as const;

/** The in-app path a link names, or null when it points outside the app. */
export function toAppPath(url: string): string | null {
	if (url.startsWith("/")) return url;
	for (const prefix of APP_LINK_PREFIXES) {
		if (url.startsWith(prefix)) {
			return `/${url.slice(prefix.length).replace(/^\/+/, "")}`;
		}
	}
	return null;
}

/**
 * The five P5 payment screens (Task 29), reachable only by direct
 * navigation, a hosted-checkout/onboarding return or an SMS link — never by
 * a push payload (`buildExpoPushData` on the API never names them; see
 * `notification-workflows.int.spec.ts`). Listed once so `deepLinks.test.ts`
 * can prove each still resolves to the screen file it names, the same way a
 * push URL does for the ones that are.
 */
export const PAYMENT_DEEP_LINKS: ReadonlyArray<{
	url: string;
	screen: string;
}> = [
	{ url: "buynsellem://checkout/o-1/pay", screen: "checkout/[orderId]/pay" },
	{
		url: "buynsellem://checkout/o-1/pending",
		screen: "checkout/[orderId]/pending",
	},
	{ url: "buynsellem://seller/payments", screen: "seller/payments/index" },
	{
		url: "buynsellem://seller/payments/setup",
		screen: "seller/payments/setup",
	},
	{
		url: "buynsellem://seller/payments/payouts/p-1",
		screen: "seller/payments/payouts/[id]",
	},
];

function stringField(
	data: Record<string, unknown>,
	key: string,
): string | null {
	const value = data[key];
	return typeof value === "string" && value.length > 0 ? value : null;
}

/** Where a tapped push should go, read off its `data`. */
export function notificationUrl(data: Record<string, unknown>): string | null {
	const direct =
		stringField(data, "url") ??
		stringField(data, "redirectUrl") ??
		stringField(data, "searchUrl") ??
		stringField(data, "deepLink");
	if (direct) return direct;
	const conversationId = stringField(data, "conversationId");
	if (conversationId) return `/messages/${conversationId}`;
	const listingId = stringField(data, "listingId");
	if (listingId) return `/listing/${listingId}`;
	return null;
}
