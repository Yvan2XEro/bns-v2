import { appPathFor } from "../../../api/src/contracts/appLinks";

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

export const CASE_DEEP_LINKS: ReadonlyArray<{
	url: string;
	screen: string;
}> = [
	{ url: "buynsellem://account/disputes", screen: "account/disputes" },
	{ url: "buynsellem://disputes/d-1", screen: "disputes/[id]" },
	{ url: "buynsellem://account/returns", screen: "account/returns" },
	{ url: "buynsellem://returns/r-1", screen: "returns/[id]" },
	{
		url: "buynsellem://moderation/disputes",
		screen: "moderation/disputes/index",
	},
	{
		url: "buynsellem://moderation/disputes/d-1",
		screen: "moderation/disputes/[id]",
	},
];

/**
 * The P7 delivery screens a link can name: the rider push route
 * (`/rider/shipment/{id}`, mobile-only — the web has no such screen), the
 * shop's shipment and settings screens, and the buyer's tracking block.
 */
export const DELIVERY_DEEP_LINKS: ReadonlyArray<{
	url: string;
	screen: string;
}> = [
	{ url: "buynsellem://purchases/o-1", screen: "purchases/[id]" },
	{
		url: "buynsellem://purchases/o-1/reschedule",
		screen: "purchases/[id]/reschedule",
	},
	{ url: "buynsellem://rider/shipment/s-1", screen: "rider/shipment/[id]" },
	{ url: "buynsellem://rider", screen: "rider/index" },
	{ url: "buynsellem://seller/shipment/s-1", screen: "seller/shipment/[id]" },
	{ url: "buynsellem://seller/delivery", screen: "seller/delivery/index" },
	{
		url: "buynsellem://seller/delivery/locations",
		screen: "seller/delivery/locations",
	},
	{ url: "buynsellem://courier", screen: "courier/index" },
];

/** The grouped purchase a multi-shop checkout leaves behind. */
export const GROUP_DEEP_LINKS: ReadonlyArray<{
	url: string;
	screen: string;
}> = [
	{
		url: "buynsellem://purchases/group/cg-1",
		screen: "purchases/group/[group]",
	},
	{ url: "/purchases/group/cg-1", screen: "purchases/group/[group]" },
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

/** The part of a notification tap the app reads (expo-notifications' response). */
export interface PushTap {
	actionIdentifier: string;
	notification: {
		request: { identifier: string; content: { data?: unknown } };
	};
}

/**
 * Where a tap on a push notification leads, with the notification's id so a
 * tap is followed once: a tap on the notification itself (not on one of its
 * action buttons) whose data names a destination.
 */
export function pushTapTarget(
	tap: PushTap | null | undefined,
	defaultAction: string,
): { id: string; url: string } | null {
	if (!tap || tap.actionIdentifier !== defaultAction) return null;
	const data = tap.notification.request.content.data;
	if (!data || typeof data !== "object") return null;
	const url = notificationUrl(data as Record<string, unknown>);
	return url ? { id: tap.notification.request.identifier, url } : null;
}

/**
 * Whether a notification tap can be followed now. Launched by the tap, the
 * app opens on `/`, whose only job is to redirect to home with a `replace`:
 * a screen opened before that redirect is the one it replaces, and the user
 * lands on home. So the tap waits for the navigator, for the redirect to
 * have happened (the path has left `/`) and for a signed-in user.
 */
export function canFollowPushTap(state: {
	navigationReady: boolean;
	pathname: string;
	signedIn: boolean;
}): boolean {
	return state.navigationReady && state.signedIn && state.pathname !== "/";
}

/**
 * The app screen a notification link opens. Novu's in-app notifications name
 * the website's pages (`/seller/messages/…`, `/seller/catalogue/…`); the app
 * maps the few whose screen differs (contracts/appLinks.ts). Null: the link
 * points outside the app.
 */
export function notificationRoute(url: string): string | null {
	const path = toAppPath(url);
	if (!path) return null;
	const [pathname = "/", search = ""] = path.split(/(?=\?)/);
	return appPathFor(pathname, search);
}
