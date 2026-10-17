// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import { getRiskFlagStats } from "../../src/services/riskFlagStats";
import { fakePayload } from "./helpers/fakePayload";

const { requireModeratorMock } = vi.hoisted(() => ({
	requireModeratorMock: vi.fn(),
}));

vi.mock("../../src/lib/moderationRoute", async (importOriginal) => ({
	...(await importOriginal<typeof import("../../src/lib/moderationRoute")>()),
	requireModerator: requireModeratorMock,
}));

const MODERATOR = { id: "moderator-1", role: "moderator" };
const NOW = new Date("2026-10-17T12:00:00.000Z");

function flag(id: string, over: Record<string, unknown> = {}) {
	return {
		id,
		subjectType: "shop",
		subjectKey: `shop-${id}`,
		signal: "orders.dispute_ratio",
		score: 50,
		severity: "medium",
		status: "open",
		evidence: {},
		firstSeenAt: "2026-10-01T00:00:00.000Z",
		lastSeenAt: "2026-10-01T00:00:00.000Z",
		...over,
	};
}

const FLAGS = [
	flag("f1", { score: 91, autoEffects: ["payout_hold"] }),
	flag("f2", { score: 80, subjectType: "user" }),
	flag("f3", { score: 79, subjectType: "phone" }),
	flag("f4", { subjectType: "device", autoEffects: ["limit_applied"] }),
	flag("f5", {
		score: 95,
		status: "reviewed",
		reviewedAt: "2026-10-10T00:00:00.000Z",
	}),
	flag("f6", { status: "dismissed", reviewedAt: "2026-10-12T00:00:00.000Z" }),
	flag("f7", { status: "actioned", reviewedAt: "2026-10-01T00:00:00.000Z" }),
	flag("f8", { status: "dismissed", reviewedAt: "2026-09-01T00:00:00.000Z" }),
];

describe("risk flag stats", () => {
	it("counts open flags by subject, high scores, automatic holds and 30-day decisions", async () => {
		const payload = fakePayload({ "risk-flags": FLAGS });
		expect(await getRiskFlagStats(payload, MODERATOR, NOW)).toEqual({
			open: 4,
			openBySubject: { user: 1, shop: 1, phone: 1, device: 1 },
			highScore: 2,
			highScoreThreshold: 80,
			payoutHeld: 1,
			reviewed: 1,
			decidedLast30Days: 3,
			dismissedLast30Days: 1,
		});
	});

	it("refuses a caller who is not a moderator", async () => {
		const payload = fakePayload({ "risk-flags": FLAGS });
		await expect(
			getRiskFlagStats(payload, { id: "u1", role: "user" }, NOW),
		).rejects.toMatchObject({ status: 403 });
	});
});

describe("risk flag stats route", () => {
	beforeEach(() => vi.clearAllMocks());

	it("serves the stats to a moderator, uncached", async () => {
		requireModeratorMock.mockResolvedValue({
			payload: fakePayload({ "risk-flags": FLAGS }),
			actor: MODERATOR,
		});
		const { GET } = await import(
			"../../src/app/(frontend)/api/moderation/risk-flags/stats/route"
		);
		const response = await GET(
			new Request("https://api.example/api/moderation/risk-flags/stats"),
		);
		expect(response.status).toBe(200);
		expect(response.headers.get("Cache-Control")).toBe("private, no-store");
		const body = await response.json();
		expect(body).toMatchObject({ open: 4, highScore: 2, payoutHeld: 1 });
	});

	it("answers the guard's refusal untouched", async () => {
		requireModeratorMock.mockResolvedValue(
			Response.json({ error: "forbidden" }, { status: 403 }),
		);
		const { GET } = await import(
			"../../src/app/(frontend)/api/moderation/risk-flags/stats/route"
		);
		const response = await GET(
			new Request("https://api.example/api/moderation/risk-flags/stats"),
		);
		expect(response.status).toBe(403);
	});
});
