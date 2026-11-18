import type { PostHog } from "posthog-js";
import {
	type AnalyticsEvent,
	type AnalyticsProps,
	type MonitoringConfig,
	RELAY_ERRORS_PATH,
	RELAY_EVENTS_PATH,
	SENTRY_DATA_COLLECTION,
} from "../../../api/src/contracts/monitoring";

type Sentry = typeof import("@sentry/browser");

/** Errors and events raised before the SDKs load, replayed once they do. */
const QUEUE_MAX = 20;

let state: "idle" | "loading" | "on" | "off" = "idle";
let sentry: Sentry | null = null;
let posthog: PostHog | null = null;
let userId: string | null = null;
const pendingErrors: unknown[] = [];
const pendingEvents: Array<[AnalyticsEvent, AnalyticsProps | undefined]> = [];

function queue<T>(list: T[], item: T): void {
	if (state === "off" || list.length >= QUEUE_MAX) return;
	list.push(item);
}

/**
 * Loads Sentry and PostHog with the API's config, once. Both arrive as their
 * own chunks, so a page never waits on them; anything reported meanwhile is
 * queued. PostHog keeps no cookie and stores nothing: an anonymous visitor
 * is a new one on each full page load, a signed-in one is their account id.
 */
export async function startMonitoring(config: MonitoringConfig): Promise<void> {
	if (state !== "idle") return;
	if (!config.webDsn && !config.analyticsKey) {
		state = "off";
		pendingErrors.length = 0;
		pendingEvents.length = 0;
		return;
	}
	state = "loading";

	const [loadedSentry, loadedPosthog] = await Promise.all([
		config.webDsn ? import("@sentry/browser").catch(() => null) : null,
		config.analyticsKey
			? import("posthog-js").then((m) => m.default).catch(() => null)
			: null,
	]);

	if (loadedSentry && config.webDsn) {
		loadedSentry.init({
			dsn: config.webDsn,
			environment: config.environment,
			tunnel: RELAY_ERRORS_PATH,
			dataCollection: SENTRY_DATA_COLLECTION,
			tracesSampleRate: config.tracesSampleRate,
			integrations:
				config.tracesSampleRate > 0
					? [loadedSentry.browserTracingIntegration()]
					: [],
		});
		sentry = loadedSentry;
	}

	if (loadedPosthog && config.analyticsKey) {
		loadedPosthog.init(config.analyticsKey, {
			api_host: RELAY_EVENTS_PATH,
			persistence: "memory",
			person_profiles: "identified_only",
			capture_pageview: "history_change",
			capture_pageleave: true,
			autocapture: false,
			disable_session_recording: true,
			disable_surveys: true,
			respect_dnt: true,
		});
		posthog = loadedPosthog;
	}

	state = "on";
	identifyUser(userId);
	for (const error of pendingErrors.splice(0)) reportError(error);
	for (const [event, props] of pendingEvents.splice(0)) track(event, props);
}

/** Files an error caught by an error boundary or a handler. */
export function reportError(error: unknown): void {
	if (state === "on") sentry?.captureException(error);
	else queue(pendingErrors, error);
}

/** One step of the purchase funnel. */
export function track(event: AnalyticsEvent, props?: AnalyticsProps): void {
	if (state === "on") posthog?.capture(event, props);
	else queue(pendingEvents, [event, props]);
}

/** Ties errors and events to the signed-in account (its id only), or forgets it. */
export function identifyUser(id: string | null): void {
	const previous = userId;
	userId = id;
	if (state !== "on") return;
	sentry?.setUser(id ? { id } : null);
	if (id) posthog?.identify(id);
	else if (previous) posthog?.reset();
}
