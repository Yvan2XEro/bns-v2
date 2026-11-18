// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

const {
	requireModeratorMock,
	getRiskFlagQueueMock,
	decideRiskFlagMock,
	getRiskFlagDetailMock,
} = vi.hoisted(() => ({
	requireModeratorMock: vi.fn(),
	getRiskFlagQueueMock: vi.fn(),
	decideRiskFlagMock: vi.fn(),
	getRiskFlagDetailMock: vi.fn(),
}));

vi.mock("../../src/lib/moderationRoute", async (importOriginal) => ({
	...(await importOriginal<typeof import("../../src/lib/moderationRoute")>()),
	requireModerator: requireModeratorMock,
}));
vi.mock("../../src/services/riskFlagQueue", async (importOriginal) => ({
	...(await importOriginal<
		typeof import("../../src/services/riskFlagQueue")
	>()),
	getRiskFlagQueue: getRiskFlagQueueMock,
}));
vi.mock("../../src/services/moderation", async (importOriginal) => ({
	...(await importOriginal<typeof import("../../src/services/moderation")>()),
	decideRiskFlag: decideRiskFlagMock,
}));
vi.mock("../../src/services/riskFlagDetail", () => ({
	getRiskFlagDetail: getRiskFlagDetailMock,
}));

describe("moderation risk flag queue route", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		requireModeratorMock.mockResolvedValue({
			payload: {},
			actor: { id: "mod", role: "moderator" },
		});
		getRiskFlagQueueMock.mockResolvedValue({
			items: [],
			hasMore: false,
			nextCursor: null,
		});
		decideRiskFlagMock.mockResolvedValue({ id: "risk-1", status: "dismissed" });
		getRiskFlagDetailMock.mockResolvedValue({
			flag: { id: "risk-1", signal: "orders.dispute_ratio" },
			subject: { type: "shop", id: "shop-1" },
			evidenceRows: [],
			relatedFlags: [],
			moderationHistory: [],
		});
	});

	it("requires moderator and applies validated filters", async () => {
		const { GET } = await import(
			"../../src/app/(frontend)/api/moderation/risk-flags/route"
		);
		const response = await GET(
			new Request(
				"https://api.example/api/moderation/risk-flags?status=open&severity=high&signal=identity.duplicate_document&subjectType=user",
			),
		);

		expect(response.status).toBe(200);
		expect(response.headers.get("Cache-Control")).toBe("private, no-store");
		expect(getRiskFlagQueueMock).toHaveBeenCalledWith(
			{},
			{
				status: "open",
				severity: "high",
				signal: "identity.duplicate_document",
				subjectType: "user",
				cursor: undefined,
			},
		);
	});

	it("refuses invalid filters and cursors without calling the queue service", async () => {
		const { GET } = await import(
			"../../src/app/(frontend)/api/moderation/risk-flags/route"
		);
		for (const url of [
			"https://api.example/api/moderation/risk-flags?severity=urgent",
			"https://api.example/api/moderation/risk-flags?cursor=bad-cursor",
		]) {
			const response = await GET(new Request(url));
			expect(response.status).toBe(400);
		}
		expect(getRiskFlagQueueMock).not.toHaveBeenCalled();
	});

	it("routes a validated moderation decision to the decision service", async () => {
		const { POST } = await import(
			"../../src/app/(frontend)/api/moderation/risk-flags/[id]/route"
		);
		const response = await POST(
			new Request("https://api.example/api/moderation/risk-flags/risk-1", {
				method: "POST",
				body: JSON.stringify({
					outcome: "dismissed",
					resolution: "false_positive",
					note: "Reviewed and confirmed.",
				}),
			}),
			{ params: Promise.resolve({ id: "risk-1" }) },
		);

		expect(response.status).toBe(200);
		expect(await response.json()).toEqual({
			id: "risk-1",
			status: "dismissed",
		});
		expect(decideRiskFlagMock).toHaveBeenCalledWith(
			expect.anything(),
			{ id: "mod", role: "moderator" },
			"risk-1",
			{
				outcome: "dismissed",
				resolution: "false_positive",
				note: "Reviewed and confirmed.",
			},
		);
	});

	it("rejects malformed decisions without invoking the moderation service", async () => {
		const { POST } = await import(
			"../../src/app/(frontend)/api/moderation/risk-flags/[id]/route"
		);
		const response = await POST(
			new Request("https://api.example/api/moderation/risk-flags/risk-1", {
				method: "POST",
				body: JSON.stringify({ outcome: "actioned" }),
			}),
			{ params: Promise.resolve({ id: "risk-1" }) },
		);

		expect(response.status).toBe(400);
		expect(decideRiskFlagMock).not.toHaveBeenCalled();
	});

	it("rejects actions attached to non-actioned outcomes and mismatched resolutions", async () => {
		const { POST } = await import(
			"../../src/app/(frontend)/api/moderation/risk-flags/[id]/route"
		);
		const action = {
			type: "hold_payouts",
			targetId: "shop-1",
			reason: "moderation",
			durationDays: 7,
		};

		const reviewed = await POST(
			new Request("https://api.example/api/moderation/risk-flags/risk-1", {
				method: "POST",
				body: JSON.stringify({ outcome: "reviewed", action }),
			}),
			{ params: Promise.resolve({ id: "risk-1" }) },
		);
		const mismatched = await POST(
			new Request("https://api.example/api/moderation/risk-flags/risk-1", {
				method: "POST",
				body: JSON.stringify({
					outcome: "actioned",
					resolution: "shop_suspended",
					note: "Hold payout.",
					action,
				}),
			}),
			{ params: Promise.resolve({ id: "risk-1" }) },
		);

		expect(reviewed.status).toBe(400);
		expect(mismatched.status).toBe(400);
		expect(decideRiskFlagMock).not.toHaveBeenCalled();
	});

	it("accepts an order-cancellation sanction only with its matching resolution", async () => {
		const { POST } = await import(
			"../../src/app/(frontend)/api/moderation/risk-flags/[id]/route"
		);
		const response = await POST(
			new Request("https://api.example/api/moderation/risk-flags/risk-1", {
				method: "POST",
				body: JSON.stringify({
					outcome: "actioned",
					resolution: "order_cancelled",
					note: "Confirmed fraudulent order.",
					action: {
						type: "cancel_order",
						targetId: "order-1",
						reason: "staff_fraud",
						durationDays: null,
					},
				}),
			}),
			{ params: Promise.resolve({ id: "risk-1" }) },
		);

		expect(response.status).toBe(200);
		expect(decideRiskFlagMock).toHaveBeenCalledWith(
			expect.anything(),
			{ id: "mod", role: "moderator" },
			"risk-1",
			expect.objectContaining({
				outcome: "actioned",
				resolution: "order_cancelled",
				action: expect.objectContaining({ type: "cancel_order" }),
			}),
		);
	});

	it("returns the risk detail without caching and delegates to the detail service", async () => {
		const { GET } = await import(
			"../../src/app/(frontend)/api/moderation/risk-flags/[id]/route"
		);
		const response = await GET(
			new Request("https://api.example/api/moderation/risk-flags/risk-1"),
			{ params: Promise.resolve({ id: "risk-1" }) },
		);

		expect(response.status).toBe(200);
		expect(response.headers.get("Cache-Control")).toBe("private, no-store");
		expect(await response.json()).toMatchObject({
			flag: { id: "risk-1" },
			subject: { type: "shop", id: "shop-1" },
		});
		expect(getRiskFlagDetailMock).toHaveBeenCalledWith(
			expect.anything(),
			{ id: "mod", role: "moderator" },
			"risk-1",
		);
	});
});
