/**
 * Number of reverse proxies between the client and this process that append
 * their own hop to `X-Forwarded-For` (nginx in every current deployment:
 * docker-compose's Traefik/dokploy setup and the Kubernetes nginx ingress
 * each sit directly in front of the app, one hop). Only entries at or beyond
 * this depth from the right are trusted; anything a client prepends itself is
 * ignored.
 */
function trustedProxyCount(): number {
	const raw = Number(process.env.TRUSTED_PROXY_COUNT ?? "1");
	return Number.isInteger(raw) && raw >= 0 ? raw : 1;
}

/**
 * The client's IP as seen by the last trusted proxy, not the first entry in
 * `X-Forwarded-For`: that header is client-supplied and a caller can prepend
 * any value, so trusting the first hop lets a caller mint a fresh rate-limit
 * bucket per request. Each trusted proxy appends the address it saw, so the
 * real client sits `trustedProxyCount` entries from the end.
 */
export function clientIp(request: Request): string {
	const trusted = trustedProxyCount();
	const forwarded = request.headers.get("x-forwarded-for");
	if (forwarded && trusted > 0) {
		const hops = forwarded
			.split(",")
			.map((hop) => hop.trim())
			.filter(Boolean);
		if (hops.length >= trusted) return hops[hops.length - trusted];
	}
	return request.headers.get("x-real-ip") ?? "unknown";
}
