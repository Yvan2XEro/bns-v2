import { createClient } from "redis";

/**
 * What `/api/health` reports. Deliberately coarse: a public, unauthenticated
 * route says whether each dependency answered, never why it did not (the
 * reason goes to the server log).
 */
export type CheckState = "ok" | "error" | "skipped";

export interface HealthCheck {
	/** A critical dependency down makes the API unhealthy (503). */
	critical: boolean;
	/** `null` when the dependency is not configured here: reported "skipped". */
	run: (() => Promise<void>) | null;
}

export interface HealthReport {
	status: "ok" | "degraded" | "error";
	checks: Record<string, { status: CheckState; latencyMs?: number }>;
}

export const CHECK_TIMEOUT_MS = 2000;

function withTimeout(work: Promise<void>, ms: number): Promise<void> {
	let timer: ReturnType<typeof setTimeout> | undefined;
	const timeout = new Promise<never>((_, reject) => {
		timer = setTimeout(() => reject(new Error(`timed out after ${ms}ms`)), ms);
	});
	return Promise.race([work, timeout]).finally(() => clearTimeout(timer));
}

/**
 * Runs every check at once, each bounded by `timeoutMs`.
 * - every check ok (or skipped) → "ok";
 * - only non-critical checks failed → "degraded": the API still serves, and a
 *   Redis outage must not pull every API pod out of the Service at once;
 * - a critical check failed → "error".
 */
export async function runHealthChecks(
	checks: Record<string, HealthCheck>,
	{
		timeoutMs = CHECK_TIMEOUT_MS,
		now = () => performance.now(),
		onFailure = (name: string, error: unknown) =>
			console.error(`[health] ${name} check failed`, error),
	}: {
		timeoutMs?: number;
		now?: () => number;
		onFailure?: (name: string, error: unknown) => void;
	} = {},
): Promise<HealthReport> {
	const entries = await Promise.all(
		Object.entries(checks).map(async ([name, check]) => {
			if (!check.run) return [name, check, { status: "skipped" }] as const;
			const started = now();
			try {
				await withTimeout(check.run(), timeoutMs);
				return [
					name,
					check,
					{ status: "ok", latencyMs: Math.round(now() - started) },
				] as const;
			} catch (error) {
				onFailure(name, error);
				return [name, check, { status: "error" }] as const;
			}
		}),
	);

	let status: HealthReport["status"] = "ok";
	const result: HealthReport["checks"] = {};
	for (const [name, check, outcome] of entries) {
		result[name] = outcome as HealthReport["checks"][string];
		if (outcome.status !== "error") continue;
		if (check.critical) status = "error";
		else if (status === "ok") status = "degraded";
	}
	return { status, checks: result };
}

/**
 * One Redis connection for the health route, opened on the first probe and
 * kept: a probe every few seconds must not open a connection each time.
 * No reconnect loop of its own — a failed probe drops the client and the
 * next one dials again.
 */
let redis: { url: string; client: ReturnType<typeof createClient> } | undefined;

export async function pingRedis(url: string): Promise<void> {
	if (redis?.url !== url) {
		const client = createClient({
			url,
			socket: { connectTimeout: CHECK_TIMEOUT_MS, reconnectStrategy: false },
		});
		client.on("error", () => {
			// Reported by the failing probe; without a listener node would throw.
		});
		redis = { url, client };
	}
	const current = redis;
	try {
		if (!current.client.isOpen) await current.client.connect();
		const reply = await current.client.ping();
		if (reply !== "PONG") throw new Error(`unexpected PING reply: ${reply}`);
	} catch (error) {
		if (redis === current) redis = undefined;
		if (current.client.isOpen)
			void current.client.disconnect().catch(() => {
				// Already closing: nothing to clean up.
			});
		throw error;
	}
}
