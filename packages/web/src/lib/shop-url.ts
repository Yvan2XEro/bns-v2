/** Pure URL helper — server-safe: a "use client" module cannot hand a
 * callable to a server component, and the shop page is one. */
const WEB_URL = process.env.NEXT_PUBLIC_WEB_URL ?? "https://buynsellem.com";

export function shopUrl(handle: string): string {
	return `${WEB_URL.replace(/\/$/, "")}/s/${handle}`;
}
