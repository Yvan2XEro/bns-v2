// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { runHealthChecks } from "../../src/lib/health";

const quiet = { onFailure: () => {} };
const ok = async () => {};
const fail = async () => {
	throw new Error("connection refused");
};

describe("runHealthChecks", () => {
	it("is ok when every check answers, and skips what is not configured", async () => {
		const report = await runHealthChecks(
			{
				mongodb: { critical: true, run: ok },
				redis: { critical: false, run: null },
			},
			quiet,
		);
		expect(report.status).toBe("ok");
		expect(report.checks.mongodb.status).toBe("ok");
		expect(report.checks.mongodb.latencyMs).toBeTypeOf("number");
		expect(report.checks.redis).toEqual({ status: "skipped" });
	});

	it("is degraded, not down, when only a non-critical check fails", async () => {
		const report = await runHealthChecks(
			{
				mongodb: { critical: true, run: ok },
				redis: { critical: false, run: fail },
			},
			quiet,
		);
		expect(report.status).toBe("degraded");
		expect(report.checks.redis).toEqual({ status: "error" });
	});

	it("is an error when a critical check fails, whatever the others say", async () => {
		const report = await runHealthChecks(
			{
				mongodb: { critical: true, run: fail },
				redis: { critical: false, run: fail },
			},
			quiet,
		);
		expect(report.status).toBe("error");
	});

	it("treats a check that hangs as failed after the timeout", async () => {
		const report = await runHealthChecks(
			{ mongodb: { critical: true, run: () => new Promise<void>(() => {}) } },
			{ ...quiet, timeoutMs: 20 },
		);
		expect(report.status).toBe("error");
	});

	it("never puts the error text in the report, only in the log", async () => {
		const onFailure = vi.fn();
		const report = await runHealthChecks(
			{ mongodb: { critical: true, run: fail } },
			{ onFailure },
		);
		expect(JSON.stringify(report)).not.toContain("connection refused");
		expect(onFailure).toHaveBeenCalledWith("mongodb", expect.any(Error));
	});
});

const ping = vi.fn();
vi.mock("@payload-config", () => ({ default: {} }));
vi.mock("../../src/payload.config.ts", () => ({ default: {} }));
vi.mock("payload", () => ({
	APIError: class APIError extends Error {},
	getPayload: vi.fn(async () => ({
		db: { connection: { db: { admin: () => ({ ping }) } } },
	})),
}));

describe("GET /api/health", () => {
	beforeEach(() => {
		ping.mockReset();
		vi.stubEnv("REDIS_URL", undefined);
		vi.spyOn(console, "error").mockImplementation(() => {});
	});
	afterEach(() => {
		vi.unstubAllEnvs();
		vi.restoreAllMocks();
	});

	const call = async () => {
		const { GET } = await import("../../src/app/(frontend)/api/health/route");
		return GET();
	};

	it("answers 200 ok, uncached, when MongoDB answers", async () => {
		ping.mockResolvedValue({ ok: 1 });
		const res = await call();
		expect(res.status).toBe(200);
		expect(res.headers.get("Cache-Control")).toBe("no-store");
		const body = await res.json();
		expect(body.status).toBe("ok");
		expect(body.checks.redis).toEqual({ status: "skipped" });
	});

	it("answers 503 when MongoDB does not", async () => {
		ping.mockRejectedValue(new Error("MongoServerSelectionError"));
		const res = await call();
		expect(res.status).toBe(503);
		expect((await res.json()).status).toBe("error");
	});

	it("answers 200 degraded when only Redis is unreachable", async () => {
		ping.mockResolvedValue({ ok: 1 });
		// Nothing listens on port 1: the connection is refused at once.
		vi.stubEnv("REDIS_URL", "redis://127.0.0.1:1");
		const res = await call();
		expect(res.status).toBe(200);
		const body = await res.json();
		expect(body.status).toBe("degraded");
		expect(body.checks.redis).toEqual({ status: "error" });
	});
});
