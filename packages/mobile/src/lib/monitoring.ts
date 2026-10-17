import * as Sentry from "@sentry/react-native";
import PostHog from "posthog-react-native";
import { Platform } from "react-native";
import {
	type AnalyticsEvent,
	type AnalyticsProps,
	type MonitoringConfig,
	RELAY_ERRORS_PATH,
	RELAY_EVENTS_PATH,
} from "../../../api/src/contracts/monitoring";
import { API_BASE_URL } from "./api";

/** Errors and events raised before the config arrives, replayed after. */
const QUEUE_MAX = 20;

let state: "idle" | "on" | "off" = "idle";
let sentryOn = false;
let posthog: PostHog | null = null;
let userId: string | null = null;
const pendingErrors: unknown[] = [];
const pendingEvents: Array<[AnalyticsEvent, AnalyticsProps | undefined]> = [];

function queue<T>(list: T[], item: T): void {
	if (state === "idle" && list.length < QUEUE_MAX) list.push(item);
}

/**
 * Starts Sentry and PostHog with the API's config, once. Both send through
 * the API's relay. PostHog keeps its anonymous id in memory only, so a
 * signed-out visitor is a new one each time the app starts; a signed-in one
 * is their account id. Skipped on the web build, which is the website's job.
 */
export function startMonitoring(config: MonitoringConfig): void {
	if (state !== "idle") return;
	if (Platform.OS === "web" || (!config.mobileDsn && !config.analyticsKey)) {
		state = "off";
		pendingErrors.length = 0;
		pendingEvents.length = 0;
		return;
	}

	if (config.mobileDsn) {
		Sentry.init({
			dsn: config.mobileDsn,
			environment: config.environment,
			tunnel: `${API_BASE_URL}${RELAY_ERRORS_PATH}`,
			sendDefaultPii: false,
			tracesSampleRate: config.tracesSampleRate,
		});
		sentryOn = true;
	}
	if (config.analyticsKey) {
		posthog = new PostHog(config.analyticsKey, {
			host: `${API_BASE_URL}${RELAY_EVENTS_PATH}`,
			persistence: "memory",
			captureAppLifecycleEvents: true,
		});
	}

	state = "on";
	identifyUser(userId);
	for (const error of pendingErrors.splice(0)) reportError(error);
	for (const [event, props] of pendingEvents.splice(0)) track(event, props);
}

/** Files an error caught by the error boundary or a handler. */
export function reportError(error: unknown): void {
	if (state === "on") {
		if (sentryOn) Sentry.captureException(error);
	} else queue(pendingErrors, error);
}

/** One step of the purchase funnel. */
export function track(event: AnalyticsEvent, props?: AnalyticsProps): void {
	if (state === "on") void posthog?.capture(event, props);
	else queue(pendingEvents, [event, props]);
}

/** The screen the user is on, by route (ids included, never names). */
export function trackScreen(pathname: string): void {
	if (state === "on") void posthog?.screen(pathname);
}

/** Ties errors and events to the signed-in account (its id only), or forgets it. */
export function identifyUser(id: string | null): void {
	const previous = userId;
	userId = id;
	if (state !== "on") return;
	if (sentryOn) Sentry.setUser(id ? { id } : null);
	if (id) posthog?.identify(id);
	else if (previous) posthog?.reset();
}
