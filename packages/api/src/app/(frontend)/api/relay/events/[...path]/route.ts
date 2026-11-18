import { posthogUpstream, RELAY_MAX_BYTES } from "@/contracts/monitoring";
import { clientIp } from "@/lib/clientIp";
import { posthogHost } from "@/lib/monitoring";
import { getCounterStore, hitRateLimit } from "@/lib/rateLimit";

const WINDOWS = [{ name: "relay-events", limit: 600, windowSeconds: 60 }];

/** Headers PostHog needs to decode a batch; cookies and auth never leave. */
const FORWARDED_HEADERS = ["content-type", "content-encoding", "user-agent"];

/**
 * PostHog's reverse proxy: the SDKs use `/api/relay/events` as their host so
 * an ad blocker does not drop them. The visitor's IP is passed on for the
 * country and city only (turn on "Discard client IP data" in PostHog).
 */
async function relay(
	request: Request,
	{ params }: { params: Promise<{ path: string[] }> },
) {
	const host = posthogHost();
	if (!host) return new Response(null, { status: 404 });

	const length = Number(request.headers.get("content-length") ?? 0);
	if (length > RELAY_MAX_BYTES) return new Response(null, { status: 413 });

	const ip = clientIp(request);
	if (await hitRateLimit(getCounterStore(), ip, WINDOWS)) {
		return new Response(null, { status: 429 });
	}

	const { path } = await params;
	const url = new URL(posthogUpstream(host, path.join("/")));
	url.search = new URL(request.url).search;

	const headers = new Headers({ "x-forwarded-for": ip });
	for (const name of FORWARDED_HEADERS) {
		const value = request.headers.get(name);
		if (value) headers.set(name, value);
	}

	const body =
		request.method === "GET" ? undefined : await request.arrayBuffer();
	if (body && body.byteLength > RELAY_MAX_BYTES) {
		return new Response(null, { status: 413 });
	}

	try {
		const upstream = await fetch(url, {
			method: request.method,
			headers,
			body,
			signal: AbortSignal.timeout(10_000),
		});
		const responseHeaders = new Headers();
		for (const name of ["content-type", "cache-control"]) {
			const value = upstream.headers.get(name);
			if (value) responseHeaders.set(name, value);
		}
		return new Response(upstream.body, {
			status: upstream.status,
			headers: responseHeaders,
		});
	} catch {
		return new Response(null, { status: 502 });
	}
}

export { relay as GET, relay as POST };
