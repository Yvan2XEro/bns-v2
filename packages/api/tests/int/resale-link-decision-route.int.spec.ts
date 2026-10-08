// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

const { decideResaleLinkMock, requireUserMock } = vi.hoisted(() => ({
	decideResaleLinkMock: vi.fn(),
	requireUserMock: vi.fn(),
}));

vi.mock("../../src/lib/shopRoute", async (importOriginal) => ({
	...(await importOriginal<typeof import("../../src/lib/shopRoute")>()),
	requireUser: requireUserMock,
}));
vi.mock("../../src/services/resaleLinks", () => ({
	decideResaleLink: decideResaleLinkMock,
}));

describe("POST /api/resale-links/:id/decision", () => {
	beforeEach(() => {
		decideResaleLinkMock.mockReset();
		requireUserMock.mockReset();
		requireUserMock.mockResolvedValue({
			payload: {},
			user: { id: "supplier-owner" },
		});
	});

	it("rejects an invalid transition action", async () => {
		const { POST } = await import(
			"../../src/app/(frontend)/api/resale-links/[id]/decision/route"
		);
		const response = await POST(
			new Request("https://api.example/api/resale-links/link-1/decision", {
				method: "POST",
				body: JSON.stringify({ action: "delete" }),
			}),
			{ params: Promise.resolve({ id: "link-1" }) },
		);

		expect(response.status).toBe(400);
		expect(decideResaleLinkMock).not.toHaveBeenCalled();
	});

	it("delegates a valid supplier decision to the service", async () => {
		const updated = { id: "link-1", status: "approved" };
		decideResaleLinkMock.mockResolvedValue(updated);
		const { POST } = await import(
			"../../src/app/(frontend)/api/resale-links/[id]/decision/route"
		);
		const response = await POST(
			new Request("https://api.example/api/resale-links/link-1/decision", {
				method: "POST",
				body: JSON.stringify({ action: "approve", note: "Verified" }),
			}),
			{ params: Promise.resolve({ id: "link-1" }) },
		);

		expect(response.status).toBe(200);
		expect(await response.json()).toEqual(updated);
		expect(decideResaleLinkMock).toHaveBeenCalledWith(
			expect.anything(),
			{ id: "supplier-owner" },
			"link-1",
			{ action: "approve", note: "Verified" },
		);
	});
});
