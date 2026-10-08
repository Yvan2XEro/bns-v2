// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

const { findMock, getPayloadMock } = vi.hoisted(() => ({
	findMock: vi.fn(),
	getPayloadMock: vi.fn(),
}));

vi.mock("@payload-config", () => ({ default: {} }));
vi.mock("../../src/payload.config.ts", () => ({ default: {} }));
vi.mock("payload", () => ({
	APIError: class APIError extends Error {},
	getPayload: getPayloadMock,
}));

describe("GET /api/public/resale-terms/current", () => {
	beforeEach(() => {
		findMock.mockReset();
		getPayloadMock.mockReset();
		getPayloadMock.mockResolvedValue({ find: findMock });
	});

	it("rejects an unknown role before loading Payload", async () => {
		const { GET } = await import(
			"../../src/app/(frontend)/api/public/resale-terms/current/route"
		);
		const response = await GET(
			new Request(
				"https://api.example/api/public/resale-terms/current?role=admin",
			),
		);

		expect(response.status).toBe(400);
		expect(getPayloadMock).not.toHaveBeenCalled();
	});

	it("returns the current role terms", async () => {
		const currentTerms = {
			id: "terms-1",
			role: "supplier",
			version: "2026-04-01",
			publishedAt: "2026-04-01T00:00:00.000Z",
		};
		findMock.mockResolvedValue({ docs: [currentTerms] });
		const { GET } = await import(
			"../../src/app/(frontend)/api/public/resale-terms/current/route"
		);

		const response = await GET(
			new Request(
				"https://api.example/api/public/resale-terms/current?role=supplier",
			),
		);

		expect(response.status).toBe(200);
		expect(await response.json()).toEqual(currentTerms);
		expect(findMock).toHaveBeenCalledWith(
			expect.objectContaining({
				collection: "resale-terms",
				overrideAccess: true,
			}),
		);
	});

	it("returns 404 when no published terms exist", async () => {
		findMock.mockResolvedValue({ docs: [] });
		const { GET } = await import(
			"../../src/app/(frontend)/api/public/resale-terms/current/route"
		);

		const response = await GET(
			new Request(
				"https://api.example/api/public/resale-terms/current?role=reseller",
			),
		);

		expect(response.status).toBe(404);
	});
});
