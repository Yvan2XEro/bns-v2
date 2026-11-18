import type * as SentryNode from "@sentry/node";
import { parseDsn, SENTRY_DATA_COLLECTION } from "@/contracts/monitoring";
import { monitoringConfig } from "@/lib/monitoring";

let sentry: Promise<typeof SentryNode | null> | undefined;

/** Sentry for the API's own errors, loaded on first use and only with `SENTRY_DSN`. */
function loadSentry(): Promise<typeof SentryNode | null> {
	sentry ??= (async () => {
		const dsn = process.env.SENTRY_DSN?.trim();
		if (!dsn || !parseDsn(dsn)) return null;
		const Sentry = await import("@sentry/node");
		Sentry.init({
			dsn,
			environment: monitoringConfig().environment,
			dataCollection: SENTRY_DATA_COLLECTION,
			// Next bundles the server; module hooks would only warn.
			enableRuntimeChannelInjection: false,
			tracesSampleRate: 0,
		});
		return Sentry;
	})().catch(() => null);
	return sentry;
}

/**
 * Files a server error with Sentry when it is configured; never throws, so a
 * reporting outage cannot turn into a second error.
 */
export async function reportServerError(
	error: unknown,
	context?: Record<string, unknown>,
): Promise<void> {
	try {
		const Sentry = await loadSentry();
		Sentry?.captureException(error, context ? { extra: context } : undefined);
	} catch {
		// Reporting is best effort.
	}
}
