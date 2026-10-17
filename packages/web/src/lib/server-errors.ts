import type * as SentryNode from "@sentry/node";
import {
	type MonitoringConfig,
	SENTRY_DATA_COLLECTION,
} from "../../../api/src/contracts/monitoring";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3000";

let sentry: Promise<typeof SentryNode | null> | undefined;

/**
 * Sentry for the web server's own errors, with the web DSN the API serves:
 * loaded on the first error, and retried on the next one if the API could
 * not be reached.
 */
function loadSentry(): Promise<typeof SentryNode | null> {
	sentry ??= (async () => {
		const response = await fetch(`${API_URL}/api/public/config`, {
			signal: AbortSignal.timeout(5000),
		});
		if (!response.ok) throw new Error(`config ${response.status}`);
		const { monitoring } = (await response.json()) as {
			monitoring?: MonitoringConfig;
		};
		if (!monitoring?.webDsn) return null;
		const Sentry = await import("@sentry/node");
		Sentry.init({
			dsn: monitoring.webDsn,
			environment: monitoring.environment,
			dataCollection: SENTRY_DATA_COLLECTION,
			// Next bundles the server; module hooks would only warn.
			enableRuntimeChannelInjection: false,
			tracesSampleRate: 0,
		});
		return Sentry;
	})().catch(() => {
		sentry = undefined;
		return null;
	});
	return sentry;
}

/** Files a server-rendering error; never throws. */
export async function reportServerError(
	error: unknown,
	context: Record<string, unknown>,
): Promise<void> {
	try {
		(await loadSentry())?.captureException(error, { extra: context });
	} catch {
		// Reporting is best effort.
	}
}
