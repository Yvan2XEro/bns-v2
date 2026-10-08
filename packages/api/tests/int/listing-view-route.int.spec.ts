// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

const { countMock, getPayloadMock } = vi.hoisted(() => ({
	countMock: vi.fn(),
	getPayloadMock: vi.fn(),
}));

vi.mock("@payload-config", () => ({ default: {} }));
vi.mock("../../src/payload.config.ts", () => ({ default: {} }));
vi.mock("payload", () => ({
	APIError: class APIError extends Error {},
	getPayload: getPayloadMock,
}));
vi.mock("../../src/services/listingViews", () => ({
	countListingView: countMock,
}));

describe("POST /api/public/listings/:id/view", () => {
	beforeEach(() => {
		countMock.mockReset().mockResolvedValue({ counted: true });
		getPayloadMock.mockReset().mockResolvedValue({
			auth: vi.fn().mockResolvedValue({ user: { id: "viewer-1" } }),
		});
	});

	it("passes the authenticated viewer and installation header to the service", async () => {
		const { POST } = await import(
			"../../src/app/(frontend)/api/public/listings/[id]/view/route"
		);
		const response = await POST(
			new Request("https://api.example/api/public/listings/listing-1/view", {
				method: "POST",
				headers: {
					"X-BNS-Install-Id": "install-1",
					"X-Forwarded-For": "192.0.2.8, 10.0.0.1",
					"User-Agent": "test-client",
				},
			}),
			{ params: Promise.resolve({ id: "listing-1" }) },
		);

		expect(response.status).toBe(204);
		expect(countMock).toHaveBeenCalledWith(
			expect.anything(),
			expect.objectContaining({
				listingId: "listing-1",
				viewerId: "viewer-1",
				installId: "install-1",
				ip: "192.0.2.8",
				userAgent: "test-client",
			}),
		);
	});

	it("returns no content when analytics storage is unavailable", async () => {
		countMock.mockRejectedValue(new Error("redis unavailable"));
		const logger = vi
			.spyOn(console, "error")
			.mockImplementation(() => undefined);
		const { POST } = await import(
			"../../src/app/(frontend)/api/public/listings/[id]/view/route"
		);
		const response = await POST(
			new Request("https://api.example/api/public/listings/listing-1/view", {
				method: "POST",
			}),
			{ params: Promise.resolve({ id: "listing-1" }) },
		);

		expect(response.status).toBe(204);
		expect(logger).toHaveBeenCalledOnce();
		logger.mockRestore();
	});
});
