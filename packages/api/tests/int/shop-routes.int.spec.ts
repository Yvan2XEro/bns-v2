// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

// vi.hoisted: these fns back mock factories below, which vitest hoists above
// every import in this file (including "../../src/endpoints/shops", which
// pulls in "payload" itself) — plain top-level consts would still be in their
// temporal dead zone when those factories run.
const { createShop, checkHandleAvailability, hitRateLimit, getPayloadMock } =
	vi.hoisted(() => ({
		createShop: vi.fn(),
		checkHandleAvailability: vi.fn(),
		hitRateLimit: vi.fn(async () => false),
		getPayloadMock: vi.fn(),
	}));

vi.mock("@payload-config", () => ({ default: {} }));
vi.mock("payload", async (importOriginal) => ({
	...(await importOriginal<typeof import("payload")>()),
	getPayload: getPayloadMock,
	addDataAndFileToRequest: vi.fn(async () => undefined),
}));
vi.mock("../../src/services/shops", async (importOriginal) => ({
	...(await importOriginal<typeof import("../../src/services/shops")>()),
	createShop,
	checkHandleAvailability,
}));
vi.mock("../../src/lib/rateLimit", () => ({
	hitRateLimit,
	getCounterStore: () => ({}),
}));
vi.mock("../../src/lib/clientIp", () => ({ clientIp: () => "1.2.3.4" }));

import { createShopEndpoint } from "../../src/endpoints/shops";
import { ServiceError } from "../../src/lib/serviceError";
import { requireUser } from "../../src/lib/shopRoute";

describe("POST /api/shops", () => {
	beforeEach(() => {
		createShop.mockReset();
	});

	it("returns 401 without a user", async () => {
		const res = await createShopEndpoint.handler({
			user: null,
			payload: {},
			data: {},
		} as never);
		expect(res.status).toBe(401);
	});

	it("creates the shop and returns 201", async () => {
		createShop.mockResolvedValue({ id: "s-1", handle: "akwatech" });
		const res = await createShopEndpoint.handler({
			user: { id: "u-1", role: "user" },
			payload: {},
			data: {
				handle: "akwatech",
				name: "Akwa",
				city: "Douala",
				categories: ["c-1"],
			},
		} as never);
		expect(res.status).toBe(201);
		expect(await res.json()).toEqual({
			shop: { id: "s-1", handle: "akwatech" },
		});
		expect(createShop).toHaveBeenCalledWith(
			{},
			expect.objectContaining({ id: "u-1" }),
			{
				handle: "akwatech",
				name: "Akwa",
				description: undefined,
				city: "Douala",
				categories: ["c-1"],
			},
		);
	});

	it("turns a service error into its code", async () => {
		createShop.mockRejectedValue(
			new ServiceError("shop.phoneNotVerified", 403),
		);
		const res = await createShopEndpoint.handler({
			user: { id: "u-1" },
			payload: {},
			data: {},
		} as never);
		expect(res.status).toBe(403);
		expect(await res.json()).toMatchObject({ code: "shop.phoneNotVerified" });
	});

	it("hides unexpected errors behind generic.server", async () => {
		createShop.mockRejectedValue(new Error("mongo exploded"));
		vi.spyOn(console, "error").mockImplementation(() => undefined);
		const res = await createShopEndpoint.handler({
			user: { id: "u-1" },
			payload: {},
			data: {},
		} as never);
		expect(res.status).toBe(500);
		expect(await res.json()).toMatchObject({ code: "generic.server" });
	});
});

describe("GET /api/public/shops/handle-available", () => {
	beforeEach(() => {
		checkHandleAvailability.mockReset();
		hitRateLimit.mockReset();
		getPayloadMock.mockResolvedValue({});
	});

	it("returns the availability", async () => {
		hitRateLimit.mockResolvedValue(false);
		checkHandleAvailability.mockResolvedValue({
			available: false,
			reason: "taken",
			handle: "akwatech",
		});
		const { GET } = await import(
			"../../src/app/(frontend)/api/public/shops/handle-available/route"
		);
		const res = await GET(
			new Request("http://x/api/public/shops/handle-available?handle=AkwaTech"),
		);
		expect(await res.json()).toEqual({
			available: false,
			reason: "taken",
			handle: "akwatech",
		});
		expect(checkHandleAvailability).toHaveBeenCalledWith({}, "AkwaTech");
		expect(hitRateLimit).toHaveBeenCalledWith({}, "handle-available:1.2.3.4", [
			{ name: "minute", limit: 30, windowSeconds: 60 },
		]);
	});

	it("returns 429 once the IP is over its budget", async () => {
		hitRateLimit.mockResolvedValue(true);
		const { GET } = await import(
			"../../src/app/(frontend)/api/public/shops/handle-available/route"
		);
		const res = await GET(
			new Request("http://x/api/public/shops/handle-available?handle=a"),
		);
		expect(res.status).toBe(429);
		expect(await res.json()).toMatchObject({ code: "generic.rateLimited" });
	});

	it("fails closed behind generic.server when the rate limiter itself throws", async () => {
		hitRateLimit.mockRejectedValue(new Error("redis down"));
		vi.spyOn(console, "error").mockImplementation(() => undefined);
		const { GET } = await import(
			"../../src/app/(frontend)/api/public/shops/handle-available/route"
		);
		const res = await GET(
			new Request("http://x/api/public/shops/handle-available?handle=a"),
		);
		expect(res.status).toBe(500);
		expect(await res.json()).toMatchObject({ code: "generic.server" });
	});
});

describe("requireUser", () => {
	beforeEach(() => {
		getPayloadMock.mockReset();
	});

	it("returns 401 when there is no session", async () => {
		getPayloadMock.mockResolvedValue({
			auth: vi.fn(async () => ({ user: null })),
		});
		const result = await requireUser(new Request("http://x"));
		expect(result).toBeInstanceOf(Response);
		expect((result as Response).status).toBe(401);
	});

	it("resolves the payload and the service user for an authenticated session", async () => {
		const payload = {
			auth: vi.fn(async () => ({ user: { id: "u-1", role: "user" } })),
		};
		getPayloadMock.mockResolvedValue(payload);
		const result = await requireUser(new Request("http://x"));
		if (result instanceof Response)
			throw new Error("expected a context, not a Response");
		expect(result.payload).toBe(payload);
		expect(result.user).toEqual(
			expect.objectContaining({ id: "u-1", role: "user" }),
		);
	});
});
