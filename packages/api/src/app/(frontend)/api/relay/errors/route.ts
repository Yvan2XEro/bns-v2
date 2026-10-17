import {
	envelopeDsn,
	parseDsn,
	RELAY_MAX_BYTES,
	sameDsn,
	sentryEnvelopeUrl,
} from "@/contracts/monitoring";
import { clientIp } from "@/lib/clientIp";
import { relayableDsns } from "@/lib/monitoring";
import { getCounterStore, hitRateLimit } from "@/lib/rateLimit";

const WINDOWS = [{ name: "relay-errors", limit: 120, windowSeconds: 60 }];

/**
 * Sentry's tunnel: the apps post envelopes here instead of to Sentry, so an
 * ad blocker does not drop them and Sentry never sees the visitor's IP. Only
 * envelopes addressed to one of our own projects are forwarded.
 */
export async function POST(request: Request) {
	const length = Number(request.headers.get("content-length") ?? 0);
	if (length > RELAY_MAX_BYTES) return new Response(null, { status: 413 });

	const body = await request.text();
	if (body.length > RELAY_MAX_BYTES) return new Response(null, { status: 413 });

	const named = parseDsn(envelopeDsn(body));
	const target = named && relayableDsns().find((dsn) => sameDsn(dsn, named));
	if (!target) return new Response(null, { status: 400 });

	if (await hitRateLimit(getCounterStore(), clientIp(request), WINDOWS)) {
		return new Response(null, { status: 429 });
	}

	try {
		const upstream = await fetch(sentryEnvelopeUrl(target), {
			method: "POST",
			headers: { "content-type": "application/x-sentry-envelope" },
			body,
			signal: AbortSignal.timeout(10_000),
		});
		return new Response(null, { status: upstream.status });
	} catch {
		return new Response(null, { status: 502 });
	}
}
