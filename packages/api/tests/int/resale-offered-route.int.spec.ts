// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

const { listMock, requireUserMock } = vi.hoisted(() => ({
	listMock: vi.fn(),
	requireUserMock: vi.fn(),
}));

vi.mock("../../src/lib/shopRoute", async (importOriginal) => ({
	...(await importOriginal<typeof import("../../src/lib/shopRoute")>()),
	requireUser: requireUserMock,
}));
vi.mock("../../src/services/resaleSupplier", async (importOriginal) => ({
	...(await importOriginal<
		typeof import("../../src/services/resaleSupplier")
	>()),
	listSupplierResaleProducts: listMock,
}));

describe("GET /api/shops/:id/resale/offered", () => {
	beforeEach(() => {
		listMock.mockReset();
		requireUserMock.mockReset();
		requireUserMock.mockResolvedValue({ payload: {}, user: { id: "owner" } });
	});

	it("returns the supplier's offered products", async () => {
		listMock.mockResolvedValue([{ productId: "product-1" }]);
		const { GET } = await import(
			"../../src/app/(frontend)/api/shops/[id]/resale/offered/route"
		);
		const response = await GET(
			new Request("https://api.example/api/shops/supplier/resale/offered"),
			{
				params: Promise.resolve({ id: "supplier" }),
			},
		);

		expect(response.status).toBe(200);
		expect(await response.json()).toEqual({
			products: [{ productId: "product-1" }],
		});
		expect(listMock).toHaveBeenCalledWith(
			expect.anything(),
			{ id: "owner" },
			"supplier",
		);
	});
});
