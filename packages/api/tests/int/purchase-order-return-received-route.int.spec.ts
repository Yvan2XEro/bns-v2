// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

const { requireUserMock, handleErrorMock, receiveMock, viewMock } = vi.hoisted(
	() => ({
		requireUserMock: vi.fn(),
		handleErrorMock: vi.fn(),
		receiveMock: vi.fn(),
		viewMock: vi.fn(),
	}),
);

vi.mock("../../src/lib/shopRoute", () => ({
	handleServiceError: handleErrorMock,
	readBody: async (request: Request) => request.json().catch(() => null),
	requireUser: requireUserMock,
}));
vi.mock("../../src/services/purchaseOrders", () => ({
	getPurchaseOrderView: viewMock,
	receivePurchaseOrderReturn: receiveMock,
}));

describe("POST /api/purchase-orders/:id/return-received", () => {
	beforeEach(() => {
		requireUserMock.mockReset().mockResolvedValue({
			payload: { id: "payload" },
			user: { id: "supplier-user", role: "user" },
		});
		handleErrorMock.mockReset();
		receiveMock.mockReset().mockResolvedValue({ status: "returned" });
		viewMock.mockReset().mockResolvedValue({ id: "po-1", status: "returned" });
	});

	it("validates the condition and returns the private purchase-order view", async () => {
		const { POST } = await import(
			"../../src/app/(frontend)/api/purchase-orders/[id]/return-received/route"
		);
		const response = await POST(
			new Request(
				"https://api.example/api/purchase-orders/po-1/return-received",
				{
					method: "POST",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify({ condition: "resellable" }),
				},
			),
			{ params: Promise.resolve({ id: "po-1" }) },
		);

		expect(response.status).toBe(200);
		expect(response.headers.get("Cache-Control")).toBe("private, no-store");
		expect(await response.json()).toEqual({ id: "po-1", status: "returned" });
		expect(receiveMock).toHaveBeenCalledWith(
			expect.objectContaining({ id: "payload" }),
			expect.objectContaining({ id: "supplier-user" }),
			"po-1",
			{ condition: "resellable" },
		);
	});

	it("rejects an unknown condition before calling the service", async () => {
		const { POST } = await import(
			"../../src/app/(frontend)/api/purchase-orders/[id]/return-received/route"
		);
		const response = await POST(
			new Request(
				"https://api.example/api/purchase-orders/po-1/return-received",
				{
					method: "POST",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify({ condition: "missing" }),
				},
			),
			{ params: Promise.resolve({ id: "po-1" }) },
		);

		expect(response.status).toBe(400);
		expect(receiveMock).not.toHaveBeenCalled();
	});
});
