import {
	type MonitoringConfig,
	NO_MONITORING,
	type ParsedDsn,
	parseDsn,
} from "@/contracts/monitoring";

const DEFAULT_POSTHOG_HOST = "https://eu.i.posthog.com";

function sampleRate(raw: string | undefined): number {
	const value = Number(raw);
	return Number.isFinite(value) && value >= 0 && value <= 1 ? value : 0;
}

/** A DSN that does not parse is treated as unset rather than shipped broken. */
function validDsn(raw: string | undefined): string | null {
	const dsn = raw?.trim();
	return dsn && parseDsn(dsn) ? dsn : null;
}

/**
 * What `GET /api/public/config` hands the apps. Each app may have its own
 * Sentry project (`SENTRY_WEB_DSN`, `SENTRY_MOBILE_DSN`); without one it
 * shares the API's `SENTRY_DSN`.
 */
export function monitoringConfig(
	env: NodeJS.ProcessEnv = process.env,
): MonitoringConfig {
	const shared = validDsn(env.SENTRY_DSN);
	return {
		environment: env.SENTRY_ENVIRONMENT?.trim() || NO_MONITORING.environment,
		webDsn: validDsn(env.SENTRY_WEB_DSN) ?? shared,
		mobileDsn: validDsn(env.SENTRY_MOBILE_DSN) ?? shared,
		tracesSampleRate: sampleRate(env.SENTRY_TRACES_SAMPLE_RATE),
		analyticsKey: env.POSTHOG_PROJECT_KEY?.trim() || null,
	};
}

/** The Sentry projects the relay may forward to: the apps' and the API's. */
export function relayableDsns(
	env: NodeJS.ProcessEnv = process.env,
): ParsedDsn[] {
	const config = monitoringConfig(env);
	return [config.webDsn, config.mobileDsn, validDsn(env.SENTRY_DSN)]
		.map(parseDsn)
		.filter((dsn): dsn is ParsedDsn => dsn !== null);
}

/** PostHog's ingestion host, or `null` when analytics is off. */
export function posthogHost(
	env: NodeJS.ProcessEnv = process.env,
): string | null {
	if (!env.POSTHOG_PROJECT_KEY?.trim()) return null;
	return env.POSTHOG_HOST?.trim() || DEFAULT_POSTHOG_HOST;
}
