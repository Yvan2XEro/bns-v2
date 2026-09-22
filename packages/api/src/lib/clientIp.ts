/** First hop of X-Forwarded-For (set by the reverse proxy), else X-Real-IP. */
export function clientIp(request: Request): string {
	const forwarded = request.headers.get("x-forwarded-for");
	if (forwarded) return forwarded.split(",")[0].trim();
	return request.headers.get("x-real-ip") ?? "unknown";
}
