// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

const { createMock, handleErrorMock, requireUserMock } = vi.hoisted(() => ({
	createMock: vi.fn(),
	handleErrorMock: vi.fn(),
	requireUserMock: vi.fn(),
}));

vi.mock("../../src/lib/shopRoute", () => ({
	handleServiceError: handleErrorMock,
	requireUser: requireUserMock,
}));
vi.mock("../../src/services/resaleListings", () => ({
	createResaleListing: createMock,
}));

describe("POST /api/shops/:id/resale-listings", () => {
	beforeEach(() => {
		requireUserMock.mockReset().mockResolvedValue({
			payload: { id: "payload" },
			user: { id: "reseller-user", role: "user" },
		});
		createMock.mockReset().mockResolvedValue({ id: "resale-listing" });
		handleErrorMock.mockReset();
	});

	it("rejects malformed prices without calling the service", async () => {
		const { POST } = await import(
			"../../src/app/(frontend)/api/shops/[id]/resale-listings/route"
		);
		const response = await POST(
			new Request("https://api.example/api/shops/shop-1/resale-listings", {
				method: "POST",
				body: JSON.stringify({
					productId: "product-1",
					prices: [{ variantId: "variant-1", price: "7000" }],
					desiredStatus: "published",
				}),
			}),
			{ params: Promise.resolve({ id: "shop-1" }) },
		);

		expect(response.status).toBe(400);
		expect(createMock).not.toHaveBeenCalled();
	});

	it("passes validated input to the service and returns the created listing", async () => {
		const payload = { id: "payload" };
		const user = { id: "reseller-user", role: "user" };
		requireUserMock.mockResolvedValue({ payload, user });
		const { POST } = await import(
			"../../src/app/(frontend)/api/shops/[id]/resale-listings/route"
		);
		const body = {
			productId: "product-1",
			prices: [{ variantId: "variant-1", price: 7000 }],
			desiredStatus: "published",
		};
		const response = await POST(
			new Request("https://api.example/api/shops/shop-1/resale-listings", {
				method: "POST",
				body: JSON.stringify(body),
			}),
			{ params: Promise.resolve({ id: "shop-1" }) },
		);

		expect(response.status).toBe(201);
		expect(await response.json()).toEqual({
			listing: { id: "resale-listing" },
		});
		expect(createMock).toHaveBeenCalledWith(payload, user, "shop-1", body);
	});
});
