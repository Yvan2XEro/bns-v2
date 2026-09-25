/** Accepts only same-origin paths, so `returnTo` can never become an open redirect. */
export function safeReturnTo(value: string | null | undefined): string | null {
	if (!value) return null;
	if (!value.startsWith("/")) return null;
	if (value.startsWith("//") || value.startsWith("/\\")) return null;
	return value;
}
