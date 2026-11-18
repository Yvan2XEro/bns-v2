// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

const { getCounterStoreMock, hitRateLimitMock, insightsMock, requireUserMock } =
	vi.hoisted(() => ({
		getCounterStoreMock: vi.fn(),
		hitRateLimitMock: vi.fn(),
		insightsMock: vi.fn(),
		requireUserMock: vi.fn(),
	}));

vi.mock("../../src/lib/rateLimit", () => ({
	getCounterStore: getCounterStoreMock,
	hitRateLimit: hitRateLimitMock,
}));
vi.mock("../../src/lib/shopRoute", async (importOriginal) => ({
	...(await importOriginal<typeof import("../../src/lib/shopRoute")>()),
	requireUser: requireUserMock,
}));
vi.mock("../../src/services/shopInsights", () => ({
	getShopInsights: insightsMock,
}));

describe("GET /api/shops/:id/insights", () => {
	beforeEach(() => {
		requireUserMock.mockReset().mockResolvedValue({
			payload: { id: "payload" },
			user: { id: "owner-1", role: "user" },
		});
		getCounterStoreMock.mockReset().mockReturnValue({});
		hitRateLimitMock.mockReset().mockResolvedValue(false);
		insightsMock.mockReset().mockResolvedValue({ period: "7d" });
	});

	it("rejects unsupported periods before authentication", async () => {
		const { GET } = await import(
			"../../src/app/(frontend)/api/shops/[id]/insights/route"
		);
		const response = await GET(
			new Request("https://api.example/api/shops/shop-1/insights?period=3d"),
			{ params: Promise.resolve({ id: "shop-1" }) },
		);

		expect(response.status).toBe(400);
		expect(requireUserMock).not.toHaveBeenCalled();
	});

	it("applies the per-user hourly limit and calls the insights service", async () => {
		const payload = { id: "payload" };
		const user = { id: "owner-1", role: "user" };
		requireUserMock.mockResolvedValue({ payload, user });
		const { GET } = await import(
			"../../src/app/(frontend)/api/shops/[id]/insights/route"
		);
		const response = await GET(
			new Request("https://api.example/api/shops/shop-1/insights?period=30d"),
			{ params: Promise.resolve({ id: "shop-1" }) },
		);

		expect(response.status).toBe(200);
		expect(response.headers.get("Cache-Control")).toBe("private, no-store");
		expect(hitRateLimitMock).toHaveBeenCalledWith({}, "shop-insights:owner-1", [
			{ name: "shop-insights", limit: 60, windowSeconds: 3600 },
		]);
		expect(insightsMock).toHaveBeenCalledWith(payload, user, "shop-1", "30d");
	});

	it("does not query the seller data when rate limited", async () => {
		hitRateLimitMock.mockResolvedValue(true);
		const { GET } = await import(
			"../../src/app/(frontend)/api/shops/[id]/insights/route"
		);
		const response = await GET(
			new Request("https://api.example/api/shops/shop-1/insights"),
			{ params: Promise.resolve({ id: "shop-1" }) },
		);

		expect(response.status).toBe(429);
		expect(insightsMock).not.toHaveBeenCalled();
	});
});
