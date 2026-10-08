// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

const {
	acceptMock,
	declareDeliveredMock,
	failDeliveryMock,
	getViewMock,
	handoverMock,
	handleErrorMock,
	requireUserMock,
	shipMock,
} = vi.hoisted(() => ({
	acceptMock: vi.fn(),
	declareDeliveredMock: vi.fn(),
	failDeliveryMock: vi.fn(),
	getViewMock: vi.fn(),
	handoverMock: vi.fn(),
	handleErrorMock: vi.fn(),
	requireUserMock: vi.fn(),
	shipMock: vi.fn(),
}));

vi.mock("../../src/lib/shopRoute", () => ({
	handleServiceError: handleErrorMock,
	readBody: (request: Request) => request.json(),
	requireUser: requireUserMock,
}));
vi.mock("../../src/services/purchaseOrders", () => ({
	acceptPurchaseOrder: acceptMock,
	declarePurchaseOrderDelivered: declareDeliveredMock,
	failPurchaseOrderDelivery: failDeliveryMock,
	getPurchaseOrderView: getViewMock,
	handoverPurchaseOrder: handoverMock,
	shipPurchaseOrder: shipMock,
}));

describe("POST /api/purchase-orders/:id/accept", () => {
	beforeEach(() => {
		requireUserMock.mockReset().mockResolvedValue({
			payload: { id: "payload" },
			user: { id: "supplier-user", role: "user" },
		});
		acceptMock
			.mockReset()
			.mockResolvedValue({ id: "po-1", status: "accepted" });
		declareDeliveredMock.mockReset().mockResolvedValue(undefined);
		failDeliveryMock.mockReset().mockResolvedValue(undefined);
		getViewMock.mockReset().mockResolvedValue({ id: "po-1", delivery: {} });
		shipMock.mockReset().mockResolvedValue({ id: "po-1", status: "shipped" });
		handoverMock.mockReset().mockResolvedValue(undefined);
		handleErrorMock.mockReset();
	});

	it("rejects an empty id without calling the service", async () => {
		const { POST } = await import(
			"../../src/app/(frontend)/api/purchase-orders/[id]/accept/route"
		);
		const response = await POST(new Request("https://api.example/"), {
			params: Promise.resolve({ id: " " }),
		});

		expect(response.status).toBe(400);
		expect(acceptMock).not.toHaveBeenCalled();
	});

	it("delegates the authenticated supplier action and returns the updated order", async () => {
		const payload = { id: "payload" };
		const user = { id: "supplier-user", role: "user" };
		requireUserMock.mockResolvedValue({ payload, user });
		const { POST } = await import(
			"../../src/app/(frontend)/api/purchase-orders/[id]/accept/route"
		);
		const response = await POST(new Request("https://api.example/"), {
			params: Promise.resolve({ id: "po-1" }),
		});

		expect(response.status).toBe(200);
		expect(await response.json()).toEqual({ id: "po-1", status: "accepted" });
		expect(acceptMock).toHaveBeenCalledWith(payload, user, "po-1");
	});

	it("serves a private no-store purchase order projection", async () => {
		const payload = { id: "payload" };
		const user = { id: "supplier-user", role: "user" };
		requireUserMock.mockResolvedValue({ payload, user });
		const { GET } = await import(
			"../../src/app/(frontend)/api/purchase-orders/[id]/route"
		);
		const response = await GET(new Request("https://api.example/"), {
			params: Promise.resolve({ id: "po-1" }),
		});

		expect(response.status).toBe(200);
		expect(response.headers.get("Cache-Control")).toBe("private, no-store");
		expect(await response.json()).toEqual({ id: "po-1", delivery: {} });
		expect(getViewMock).toHaveBeenCalledWith(payload, user, "po-1");
	});

	it("validates and delegates supplier shipment details", async () => {
		const payload = { id: "payload" };
		const user = { id: "supplier-user", role: "user" };
		requireUserMock.mockResolvedValue({ payload, user });
		const { POST } = await import(
			"../../src/app/(frontend)/api/purchase-orders/[id]/ship/route"
		);
		const response = await POST(
			new Request("https://api.example/", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					carrier: "other",
					trackingNumber: "TRACK-42",
					trackingUrl: "https://carrier.example/track/42",
				}),
			}),
			{ params: Promise.resolve({ id: "po-1" }) },
		);

		expect(response.status).toBe(200);
		expect(shipMock).toHaveBeenCalledWith(payload, user, "po-1", {
			carrier: "other",
			trackingNumber: "TRACK-42",
			trackingUrl: "https://carrier.example/track/42",
		});
		expect(getViewMock).toHaveBeenCalledWith(payload, user, "po-1");
	});

	it("rejects an invalid tracking URL without running the transition", async () => {
		const { POST } = await import(
			"../../src/app/(frontend)/api/purchase-orders/[id]/ship/route"
		);
		const response = await POST(
			new Request("https://api.example/", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ carrier: "other", trackingUrl: "not-a-url" }),
			}),
			{ params: Promise.resolve({ id: "po-1" }) },
		);

		expect(response.status).toBe(400);
		expect(shipMock).not.toHaveBeenCalled();
	});

	it("validates and delegates supplier handover codes", async () => {
		const payload = { id: "payload" };
		const user = { id: "supplier-user", role: "user" };
		requireUserMock.mockResolvedValue({ payload, user });
		const { POST } = await import(
			"../../src/app/(frontend)/api/purchase-orders/[id]/handover/route"
		);
		const response = await POST(
			new Request("https://api.example/", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ code: "4821" }),
			}),
			{ params: Promise.resolve({ id: "po-1" }) },
		);

		expect(response.status).toBe(200);
		expect(handoverMock).toHaveBeenCalledWith(payload, user, "po-1", "4821");
		expect(getViewMock).toHaveBeenCalledWith(payload, user, "po-1");
	});

	it("rejects a missing code without transitioning the purchase order", async () => {
		const { POST } = await import(
			"../../src/app/(frontend)/api/purchase-orders/[id]/handover/route"
		);
		const response = await POST(
			new Request("https://api.example/", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ code: " " }),
			}),
			{ params: Promise.resolve({ id: "po-1" }) },
		);

		expect(response.status).toBe(400);
		expect(handoverMock).not.toHaveBeenCalled();
	});

	it("validates and delegates a supplier delivery declaration", async () => {
		const payload = { id: "payload" };
		const user = { id: "supplier-user", role: "user" };
		requireUserMock.mockResolvedValue({ payload, user });
		const { POST } = await import(
			"../../src/app/(frontend)/api/purchase-orders/[id]/declare-delivered/route"
		);
		const response = await POST(
			new Request("https://api.example/", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ note: "Received", photoId: "proof-1" }),
			}),
			{ params: Promise.resolve({ id: "po-1" }) },
		);

		expect(response.status).toBe(200);
		expect(declareDeliveredMock).toHaveBeenCalledWith(payload, user, "po-1", {
			note: "Received",
			photoId: "proof-1",
		});
	});

	it("validates and delegates supplier delivery failures", async () => {
		const payload = { id: "payload" };
		const user = { id: "supplier-user", role: "user" };
		requireUserMock.mockResolvedValue({ payload, user });
		const { POST } = await import(
			"../../src/app/(frontend)/api/purchase-orders/[id]/delivery-failed/route"
		);
		const response = await POST(
			new Request("https://api.example/", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					reason: "refused",
					failedDeliveryCost: 500,
					note: "Buyer refused",
				}),
			}),
			{ params: Promise.resolve({ id: "po-1" }) },
		);

		expect(response.status).toBe(200);
		expect(failDeliveryMock).toHaveBeenCalledWith(payload, user, "po-1", {
			reason: "refused",
			failedDeliveryCost: 500,
			note: "Buyer refused",
		});
	});
});
