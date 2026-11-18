import { beforeAll, describe, expect, mock, test } from "bun:test";
import {
	ANALYTICS_EVENTS,
	RELAY_ERRORS_PATH,
	RELAY_EVENTS_PATH,
} from "../../../api/src/contracts/monitoring";

const sentry = {
	init: mock(),
	captureException: mock(),
	setUser: mock(),
	browserTracingIntegration: mock(() => ({ name: "BrowserTracing" })),
};
const posthog = {
	init: mock(),
	capture: mock(),
	identify: mock(),
	reset: mock(),
};
mock.module("@sentry/browser", () => sentry);
mock.module("posthog-js", () => ({ default: posthog }));

const { identifyUser, reportError, startMonitoring, track } = await import(
	"./monitoring"
);

describe("monitoring", () => {
	const early = new Error("before load");

	beforeAll(async () => {
		// Raised before the SDKs load: queued, then replayed.
		reportError(early);
		track(ANALYTICS_EVENTS.addToCart, { listing_id: "l1", quantity: 1 });
		identifyUser("u1");
		await startMonitoring({
			environment: "staging",
			webDsn: "https://k@o1.ingest.de.sentry.io/1",
			mobileDsn: null,
			tracesSampleRate: 0,
			analyticsKey: "phc_test",
		});
	});

	test("Sentry goes through the API relay and collects nothing personal", () => {
		const [options] = sentry.init.mock.calls[0];
		expect(options).toMatchObject({
			dsn: "https://k@o1.ingest.de.sentry.io/1",
			environment: "staging",
			tunnel: RELAY_ERRORS_PATH,
			dataCollection: { userInfo: false, cookies: false, httpHeaders: false },
			integrations: [],
		});
	});

	test("PostHog goes through the API relay and stores nothing", () => {
		const [key, options] = posthog.init.mock.calls[0];
		expect(key).toBe("phc_test");
		expect(options).toMatchObject({
			api_host: RELAY_EVENTS_PATH,
			persistence: "memory",
			person_profiles: "identified_only",
			autocapture: false,
			disable_session_recording: true,
		});
	});

	test("what was raised before loading is replayed, with the account id only", () => {
		expect(sentry.captureException).toHaveBeenCalledWith(early);
		expect(posthog.capture).toHaveBeenCalledWith("add_to_cart", {
			listing_id: "l1",
			quantity: 1,
		});
		expect(sentry.setUser).toHaveBeenCalledWith({ id: "u1" });
		expect(posthog.identify).toHaveBeenCalledWith("u1");
	});

	test("signing out forgets the account", () => {
		identifyUser(null);
		expect(sentry.setUser).toHaveBeenLastCalledWith(null);
		expect(posthog.reset).toHaveBeenCalled();
	});

	test("starts once", async () => {
		await startMonitoring({
			environment: "x",
			webDsn: null,
			mobileDsn: null,
			tracesSampleRate: 0,
			analyticsKey: null,
		});
		expect(sentry.init).toHaveBeenCalledTimes(1);
	});
});
