// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

const { listResaleLinksMock, requestResaleLinkMock, requireUserMock } =
	vi.hoisted(() => ({
		listResaleLinksMock: vi.fn(),
		requestResaleLinkMock: vi.fn(),
		requireUserMock: vi.fn(),
	}));

vi.mock("../../src/lib/shopRoute", async (importOriginal) => ({
	...(await importOriginal<typeof import("../../src/lib/shopRoute")>()),
	requireUser: requireUserMock,
}));
vi.mock("../../src/services/resaleLinks", () => ({
	listResaleLinks: listResaleLinksMock,
	requestResaleLink: requestResaleLinkMock,
}));

describe("POST /api/shops/:id/resale-links", () => {
	beforeEach(() => {
		listResaleLinksMock.mockReset();
		requestResaleLinkMock.mockReset();
		requireUserMock.mockReset();
		requireUserMock.mockResolvedValue({
			payload: {},
			user: { id: "reseller-owner" },
		});
	});

	it("rejects an invalid list side before calling the service", async () => {
		const { GET } = await import(
			"../../src/app/(frontend)/api/shops/[id]/resale-links/route"
		);
		const response = await GET(
			new Request(
				"https://api.example/api/shops/reseller/resale-links?side=any",
			),
			{ params: Promise.resolve({ id: "reseller" }) },
		);

		expect(response.status).toBe(400);
		expect(listResaleLinksMock).not.toHaveBeenCalled();
	});

	it("lists links using the selected shop side and status", async () => {
		const result = { docs: [{ id: "link-1" }], totalDocs: 1 };
		listResaleLinksMock.mockResolvedValue(result);
		const { GET } = await import(
			"../../src/app/(frontend)/api/shops/[id]/resale-links/route"
		);
		const response = await GET(
			new Request(
				"https://api.example/api/shops/supplier/resale-links?side=supplier&status=requested",
			),
			{ params: Promise.resolve({ id: "supplier" }) },
		);

		expect(response.status).toBe(200);
		expect(await response.json()).toEqual(result);
		expect(listResaleLinksMock).toHaveBeenCalledWith(
			expect.anything(),
			{ id: "reseller-owner" },
			"supplier",
			{ side: "supplier", status: "requested" },
		);
	});

	it("rejects malformed input without calling the service", async () => {
		const { POST } = await import(
			"../../src/app/(frontend)/api/shops/[id]/resale-links/route"
		);
		const response = await POST(
			new Request("https://api.example/api/shops/reseller/resale-links", {
				method: "POST",
				body: JSON.stringify({ supplierShop: "supplier" }),
			}),
			{ params: Promise.resolve({ id: "reseller" }) },
		);

		expect(response.status).toBe(400);
		expect(requestResaleLinkMock).not.toHaveBeenCalled();
	});

	it("creates a link request through the service", async () => {
		const link = { id: "link-1", status: "requested" };
		requestResaleLinkMock.mockResolvedValue(link);
		const { POST } = await import(
			"../../src/app/(frontend)/api/shops/[id]/resale-links/route"
		);
		const response = await POST(
			new Request("https://api.example/api/shops/reseller/resale-links", {
				method: "POST",
				body: JSON.stringify({
					supplierShop: "supplier",
					message: "Please approve",
					acceptTermsVersion: "2026-10-01",
				}),
			}),
			{ params: Promise.resolve({ id: "reseller" }) },
		);

		expect(response.status).toBe(201);
		expect(await response.json()).toEqual(link);
		expect(requestResaleLinkMock).toHaveBeenCalledWith(
			expect.anything(),
			{ id: "reseller-owner" },
			"reseller",
			{
				supplierShop: "supplier",
				message: "Please approve",
				acceptTermsVersion: "2026-10-01",
			},
		);
	});
});
