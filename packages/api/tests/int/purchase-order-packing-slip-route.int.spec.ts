// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

const { requireUserMock, handleErrorMock, renderMock } = vi.hoisted(() => ({
	requireUserMock: vi.fn(),
	handleErrorMock: vi.fn(),
	renderMock: vi.fn(),
}));

vi.mock("../../src/lib/shopRoute", () => ({
	handleServiceError: handleErrorMock,
	requireUser: requireUserMock,
}));
vi.mock("../../src/services/purchaseOrderPackingSlip", () => ({
	getPurchaseOrderPackingSlipHtml: renderMock,
}));

describe("GET /api/purchase-orders/:id/packing-slip", () => {
	beforeEach(() => {
		requireUserMock.mockReset().mockResolvedValue({
			payload: { id: "payload" },
			user: { id: "supplier-user", role: "user" },
		});
		handleErrorMock.mockReset();
		renderMock.mockReset().mockResolvedValue("<!doctype html><p>Slip</p>");
	});

	it("returns a private, non-cacheable HTML document in the requested locale", async () => {
		const { GET } = await import(
			"../../src/app/(frontend)/api/purchase-orders/[id]/packing-slip/route"
		);
		const payload = { id: "payload" };
		const user = { id: "supplier-user", role: "user" };
		requireUserMock.mockResolvedValue({ payload, user });
		const response = await GET(
			new Request(
				"https://api.example/api/purchase-orders/po-1/packing-slip?lang=en",
			),
			{ params: Promise.resolve({ id: "po-1" }) },
		);

		expect(response.status).toBe(200);
		expect(response.headers.get("Content-Type")).toBe(
			"text/html; charset=utf-8",
		);
		expect(response.headers.get("Cache-Control")).toBe("private, no-store");
		expect(await response.text()).toContain("<p>Slip</p>");
		expect(renderMock).toHaveBeenCalledWith(payload, user, "po-1", "en");
	});

	it("rejects unsupported locales without generating a packing slip", async () => {
		const { GET } = await import(
			"../../src/app/(frontend)/api/purchase-orders/[id]/packing-slip/route"
		);
		const response = await GET(
			new Request(
				"https://api.example/api/purchase-orders/po-1/packing-slip?lang=de",
			),
			{ params: Promise.resolve({ id: "po-1" }) },
		);

		expect(response.status).toBe(400);
		expect(renderMock).not.toHaveBeenCalled();
	});
});
