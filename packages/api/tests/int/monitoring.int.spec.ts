// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";
import {
	envelopeDsn,
	parseDsn,
	posthogUpstream,
	sentryEnvelopeUrl,
} from "../../src/contracts/monitoring";
import { monitoringConfig, posthogHost } from "../../src/lib/monitoring";

const WEB_DSN = "https://abc123@o1.ingest.de.sentry.io/4501";
const API_DSN = "https://def456@o1.ingest.de.sentry.io/4502";

const envelope = (dsn: string) =>
	`${JSON.stringify({ dsn, sent_at: "2026-10-17T00:00:00Z" })}\n{"type":"event"}\n{}`;

describe("monitoring contract", () => {
	it("parses a DSN and builds its ingestion URL", () => {
		const dsn = parseDsn(WEB_DSN);
		expect(dsn).toEqual({
			protocol: "https",
			host: "o1.ingest.de.sentry.io",
			projectId: "4501",
			publicKey: "abc123",
		});
		expect(dsn && sentryEnvelopeUrl(dsn)).toBe(
			"https://o1.ingest.de.sentry.io/api/4501/envelope/",
		);
	});

	it("refuses what is not a DSN", () => {
		expect(parseDsn("not a url")).toBeNull();
		expect(parseDsn("https://o1.ingest.sentry.io/4501")).toBeNull();
		expect(parseDsn("ftp://k@o1.ingest.sentry.io/4501")).toBeNull();
		expect(parseDsn("https://k@o1.ingest.sentry.io/project")).toBeNull();
		expect(parseDsn(null)).toBeNull();
	});

	it("reads the DSN an envelope names", () => {
		expect(envelopeDsn(envelope(WEB_DSN))).toBe(WEB_DSN);
		expect(envelopeDsn("garbage")).toBeNull();
		expect(envelopeDsn('{"event_id":"1"}\n{}')).toBeNull();
	});

	it("sends PostHog's static files to its assets host", () => {
		expect(posthogUpstream("https://eu.i.posthog.com", "static/array.js")).toBe(
			"https://eu-assets.i.posthog.com/static/array.js",
		);
		expect(posthogUpstream("https://eu.i.posthog.com/", "/e/")).toBe(
			"https://eu.i.posthog.com/e/",
		);
	});
});

describe("monitoringConfig", () => {
	it("is off with nothing set", () => {
		expect(monitoringConfig({})).toEqual({
			environment: "production",
			webDsn: null,
			mobileDsn: null,
			tracesSampleRate: 0,
			analyticsKey: null,
		});
		expect(posthogHost({})).toBeNull();
	});

	it("shares the API's DSN unless an app has its own", () => {
		const config = monitoringConfig({
			SENTRY_DSN: API_DSN,
			SENTRY_WEB_DSN: WEB_DSN,
			SENTRY_ENVIRONMENT: "staging",
			SENTRY_TRACES_SAMPLE_RATE: "0.1",
			POSTHOG_PROJECT_KEY: "phc_test",
		});
		expect(config).toEqual({
			environment: "staging",
			webDsn: WEB_DSN,
			mobileDsn: API_DSN,
			tracesSampleRate: 0.1,
			analyticsKey: "phc_test",
		});
	});

	it("drops a malformed DSN and an out-of-range sample rate", () => {
		const config = monitoringConfig({
			SENTRY_WEB_DSN: "oops",
			SENTRY_TRACES_SAMPLE_RATE: "5",
		});
		expect(config.webDsn).toBeNull();
		expect(config.tracesSampleRate).toBe(0);
	});

	it("defaults PostHog to its EU host", () => {
		expect(posthogHost({ POSTHOG_PROJECT_KEY: "phc_test" })).toBe(
			"https://eu.i.posthog.com",
		);
	});
});

describe("POST /api/relay/errors", () => {
	const fetchMock = vi.fn(async () => new Response(null, { status: 200 }));

	afterEach(() => {
		vi.unstubAllEnvs();
		vi.unstubAllGlobals();
		fetchMock.mockClear();
	});

	async function post(body: string) {
		vi.stubEnv("SENTRY_DSN", API_DSN);
		vi.stubEnv("SENTRY_WEB_DSN", WEB_DSN);
		vi.stubGlobal("fetch", fetchMock);
		const { POST } = await import(
			"../../src/app/(frontend)/api/relay/errors/route"
		);
		return POST(
			new Request("http://api.test/api/relay/errors", {
				method: "POST",
				body,
			}),
		);
	}

	it("forwards an envelope for one of our projects", async () => {
		const response = await post(envelope(WEB_DSN));
		expect(response.status).toBe(200);
		expect(fetchMock).toHaveBeenCalledWith(
			"https://o1.ingest.de.sentry.io/api/4501/envelope/",
			expect.objectContaining({ method: "POST" }),
		);
	});

	it("refuses an envelope for someone else's project", async () => {
		const response = await post(
			envelope("https://abc123@o1.ingest.de.sentry.io/9999"),
		);
		expect(response.status).toBe(400);
		expect(fetchMock).not.toHaveBeenCalled();
	});

	it("refuses what is not an envelope", async () => {
		const response = await post("hello");
		expect(response.status).toBe(400);
		expect(fetchMock).not.toHaveBeenCalled();
	});
});
