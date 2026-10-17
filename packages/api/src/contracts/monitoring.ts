/**
 * Error reporting (Sentry) and product analytics (PostHog), configured on the
 * API only and handed to the apps by `GET /api/public/config` — no client
 * build carries a key.
 *
 * Both keys a client receives are *public by design*: a Sentry DSN and a
 * PostHog project key can only send events, never read them, so encrypting
 * them would hide nothing (the app would have to ship the decryption key).
 * What does matter is kept server-side: the clients send through the API's
 * relay (`RELAY_*_PATH`), which only forwards to the configured project, caps
 * the size, keeps the visitor's IP away from Sentry and survives ad blockers.
 * Account tokens (source-map upload, PostHog personal keys) are never part of
 * this config.
 */

/** Same-origin path the web's Sentry SDK tunnels envelopes through. */
export const RELAY_ERRORS_PATH = "/api/relay/errors";
/** Prefix PostHog's SDKs use as their host; the rest of the path is PostHog's own. */
export const RELAY_EVENTS_PATH = "/api/relay/events";
/** Largest envelope or event batch the relay forwards. */
export const RELAY_MAX_BYTES = 1_000_000;

export interface MonitoringConfig {
	/** Deployment name events are filed under (`production`, `staging`…). */
	environment: string;
	/** Sentry DSNs per app; `null` turns error reporting off for that app. */
	webDsn: string | null;
	mobileDsn: string | null;
	/** Share of page loads traced for performance, 0–1. */
	tracesSampleRate: number;
	/** PostHog project key (`phc_…`); `null` turns analytics off. */
	analyticsKey: string | null;
}

export const NO_MONITORING: MonitoringConfig = {
	environment: "production",
	webDsn: null,
	mobileDsn: null,
	tracesSampleRate: 0,
	analyticsKey: null,
};

export interface ParsedDsn {
	protocol: "http" | "https";
	host: string;
	projectId: string;
	publicKey: string;
}

/** `https://<key>@<host>/<project>`; anything else is `null`. */
export function parseDsn(dsn: string | null | undefined): ParsedDsn | null {
	if (!dsn) return null;
	let url: URL;
	try {
		url = new URL(dsn);
	} catch {
		return null;
	}
	const protocol = url.protocol.replace(":", "");
	const projectId = url.pathname.split("/").filter(Boolean).pop();
	if (
		(protocol !== "http" && protocol !== "https") ||
		!url.username ||
		!projectId ||
		!/^\d+$/.test(projectId)
	) {
		return null;
	}
	return { protocol, host: url.host, projectId, publicKey: url.username };
}

/** Sentry's ingestion URL for one project. */
export function sentryEnvelopeUrl(dsn: ParsedDsn): string {
	return `${dsn.protocol}://${dsn.host}/api/${dsn.projectId}/envelope/`;
}

/**
 * The DSN an envelope names in its first line, or `null` when the header is
 * not JSON or names none.
 */
export function envelopeDsn(envelope: string): string | null {
	const end = envelope.indexOf("\n");
	const header = end === -1 ? envelope : envelope.slice(0, end);
	try {
		const parsed: unknown = JSON.parse(header);
		if (parsed && typeof parsed === "object" && "dsn" in parsed) {
			const { dsn } = parsed as { dsn: unknown };
			return typeof dsn === "string" ? dsn : null;
		}
	} catch {
		// Not an envelope.
	}
	return null;
}

/** Same project, same key, same host: the only DSNs the relay forwards. */
export function sameDsn(a: ParsedDsn, b: ParsedDsn): boolean {
	return (
		a.host === b.host &&
		a.projectId === b.projectId &&
		a.publicKey === b.publicKey
	);
}

/**
 * Where a relayed PostHog path goes: its static assets live on a separate
 * `-assets` host (`eu.i.posthog.com` → `eu-assets.i.posthog.com`).
 */
export function posthogUpstream(host: string, path: string): string {
	const base = host.replace(/\/+$/, "");
	const clean = path.replace(/^\/+/, "");
	if (clean.startsWith("static/")) {
		return `${base.replace(/^(https?:\/\/)([a-z]+)\.i\./, "$1$2-assets.i.")}/${clean}`;
	}
	return `${base}/${clean}`;
}

/**
 * Sentry's `dataCollection` for every app: nothing personal leaves with an
 * error — no headers, cookies, bodies, query strings or user details beyond
 * the account id we set ourselves.
 */
export const SENTRY_DATA_COLLECTION = {
	userInfo: false,
	cookies: false,
	httpHeaders: false,
	httpBodies: [],
	urlQueryParams: false,
	graphQL: { document: false, variables: false },
	genAI: { inputs: false, outputs: false },
};

/**
 * The purchase funnel, named once for both apps so web and mobile land in the
 * same PostHog funnel. Page views and screens are captured on their own.
 */
export const ANALYTICS_EVENTS = {
	addToCart: "add_to_cart",
	checkoutStarted: "checkout_started",
	orderPlaced: "order_placed",
	/** A listing form got its first real input: the start of time-to-first-listing. */
	listingStarted: "listing_started",
	listingPublished: "listing_published",
	/** The chat service refused a message (the app keeps it to retry). */
	messageFailed: "message_failed",
} as const;

export type AnalyticsEvent =
	(typeof ANALYTICS_EVENTS)[keyof typeof ANALYTICS_EVENTS];

/** Event properties: ids, counts and choices only — never a name, phone or address. */
export type AnalyticsProps = Record<string, string | number | boolean | null>;
