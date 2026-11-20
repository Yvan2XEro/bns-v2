/**
 * GET /api/health — is this API instance able to serve?
 *
 * Used by the Kubernetes startup and readiness probes and by the external
 * uptime monitor. MongoDB is critical: unreachable → 503. Redis is not:
 * unreachable → 200 "degraded" (rate limits fall back to memory, live
 * events pause), so one Redis outage does not take every API pod out of the
 * Service at once. Not for a liveness probe: a database outage must not
 * restart healthy pods.
 *
 * Public and unauthenticated, so it says only ok / error per dependency,
 * never the error itself (that goes to the server log).
 */
import config from "@payload-config";
import type { MongooseAdapter } from "@payloadcms/db-mongodb";
import { getPayload } from "payload";
import { pingRedis, runHealthChecks } from "@/lib/health";

export const dynamic = "force-dynamic";

export async function GET(): Promise<Response> {
	const report = await runHealthChecks({
		mongodb: {
			critical: true,
			run: async () => {
				const payload = await getPayload({ config });
				const db = (payload.db as unknown as MongooseAdapter).connection.db;
				if (!db) throw new Error("no MongoDB connection");
				await db.admin().ping();
			},
		},
		redis: {
			critical: false,
			run: process.env.REDIS_URL
				? () => pingRedis(process.env.REDIS_URL as string)
				: null,
		},
	});

	return Response.json(report, {
		status: report.status === "error" ? 503 : 200,
		headers: { "Cache-Control": "no-store" },
	});
}
