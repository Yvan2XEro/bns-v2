// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

const { catalogueMock, handleErrorMock, requireUserMock } = vi.hoisted(() => ({
	catalogueMock: vi.fn(),
	handleErrorMock: vi.fn(),
	requireUserMock: vi.fn(),
}));

vi.mock("../../src/lib/shopRoute", () => ({
	handleServiceError: handleErrorMock,
	requireUser: requireUserMock,
}));
vi.mock("../../src/services/resaleCatalogue", () => ({
	listResaleCatalogue: catalogueMock,
}));

describe("GET /api/resale/catalogue", () => {
	beforeEach(() => {
		requireUserMock.mockReset().mockResolvedValue({
			payload: { id: "payload" },
			user: { id: "reseller-1", role: "user" },
		});
		catalogueMock.mockReset().mockResolvedValue({ products: [] });
	});

	it("validates parameters before authentication", async () => {
		const { GET } = await import(
			"../../src/app/(frontend)/api/resale/catalogue/route"
		);
		const response = await GET(
			new Request("https://api.example/api/resale/catalogue?shop=%20"),
		);

		expect(response.status).toBe(400);
		expect(requireUserMock).not.toHaveBeenCalled();
	});

	it("passes validated filters to the permission-checked service", async () => {
		const payload = { id: "payload" };
		const user = { id: "reseller-1", role: "user" };
		requireUserMock.mockResolvedValue({ payload, user });
		const { GET } = await import(
			"../../src/app/(frontend)/api/resale/catalogue/route"
		);
		const response = await GET(
			new Request(
				"https://api.example/api/resale/catalogue?shop=shop-1&q=adapter&category=cat-1&supplier=supplier-1",
			),
		);

		expect(response.status).toBe(200);
		expect(response.headers.get("Cache-Control")).toBe("private, no-store");
		expect(catalogueMock).toHaveBeenCalledWith(payload, user, "shop-1", {
			query: "adapter",
			categoryId: "cat-1",
			supplierShopId: "supplier-1",
		});
	});
});
