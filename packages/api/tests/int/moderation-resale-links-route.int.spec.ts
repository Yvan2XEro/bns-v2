// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

const { suspendResaleLinkMock, unsuspendResaleLinkMock, requireModeratorMock } =
	vi.hoisted(() => ({
		suspendResaleLinkMock: vi.fn(),
		unsuspendResaleLinkMock: vi.fn(),
		requireModeratorMock: vi.fn(),
	}));

vi.mock("../../src/lib/moderationRoute", async (importOriginal) => ({
	...(await importOriginal<typeof import("../../src/lib/moderationRoute")>()),
	requireModerator: requireModeratorMock,
}));
vi.mock("../../src/services/moderation", async (importOriginal) => ({
	...(await importOriginal<typeof import("../../src/services/moderation")>()),
	suspendResaleLink: suspendResaleLinkMock,
	unsuspendResaleLink: unsuspendResaleLinkMock,
}));

describe("moderation resale-link route", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		requireModeratorMock.mockResolvedValue({
			payload: {},
			actor: { id: "moderator", role: "moderator" },
		});
	});

	it("routes validated suspend and unsuspend actions to their services", async () => {
		const updated = { id: "link-1", status: "suspended" };
		suspendResaleLinkMock.mockResolvedValue(updated);
		const { POST } = await import(
			"../../src/app/(frontend)/api/moderation/resale-links/[id]/route"
		);
		const response = await POST(
			new Request("https://api.example/api/moderation/resale-links/link-1", {
				method: "POST",
				body: JSON.stringify({
					action: "suspend",
					reason: "fraud_review",
					note: "Review evidence",
				}),
			}),
			{ params: Promise.resolve({ id: "link-1" }) },
		);
		expect(response.status).toBe(200);
		expect(await response.json()).toEqual(updated);
		expect(suspendResaleLinkMock).toHaveBeenCalledWith(
			expect.anything(),
			{ id: "moderator", role: "moderator" },
			"link-1",
			{ reason: "fraud_review", note: "Review evidence" },
		);

		unsuspendResaleLinkMock.mockResolvedValue({
			id: "link-1",
			status: "approved",
		});
		const unsuspend = await POST(
			new Request("https://api.example/api/moderation/resale-links/link-1", {
				method: "POST",
				body: JSON.stringify({
					action: "unsuspend",
					note: "Review complete",
					releaseCommissions: true,
				}),
			}),
			{ params: Promise.resolve({ id: "link-1" }) },
		);
		expect(unsuspend.status).toBe(200);
		expect(unsuspendResaleLinkMock).toHaveBeenCalledWith(
			expect.anything(),
			{ id: "moderator", role: "moderator" },
			"link-1",
			{ note: "Review complete", releaseCommissions: true },
		);
	});

	it("rejects malformed actions", async () => {
		const { POST } = await import(
			"../../src/app/(frontend)/api/moderation/resale-links/[id]/route"
		);
		const response = await POST(
			new Request("https://api.example/api/moderation/resale-links/link-1", {
				method: "POST",
				body: JSON.stringify({
					action: "unsuspend",
					releaseCommissions: "yes",
				}),
			}),
			{ params: Promise.resolve({ id: "link-1" }) },
		);
		expect(response.status).toBe(400);
		expect(unsuspendResaleLinkMock).not.toHaveBeenCalled();
	});

	it("projects both shops, link history, orders and commissions to staff", async () => {
		const find = vi
			.fn()
			.mockResolvedValueOnce({ docs: [{ id: "audit-1" }] })
			.mockResolvedValueOnce({ docs: [{ id: "po-1" }] })
			.mockResolvedValueOnce({ docs: [{ id: "commission-1" }] });
		const findByID = vi
			.fn()
			.mockResolvedValueOnce({
				id: "link-1",
				supplierShop: "supplier",
				resellerShop: "reseller",
			})
			.mockResolvedValueOnce({ id: "supplier", name: "Supplier", level: 3 })
			.mockResolvedValueOnce({ id: "reseller", name: "Reseller", level: 2 });
		requireModeratorMock.mockResolvedValueOnce({
			payload: { find, findByID },
			actor: { id: "moderator", role: "moderator" },
		});
		const { GET } = await import(
			"../../src/app/(frontend)/api/moderation/resale-links/[id]/route"
		);
		const response = await GET(
			new Request("https://api.example/api/moderation/resale-links/link-1"),
			{ params: Promise.resolve({ id: "link-1" }) },
		);
		expect(response.status).toBe(200);
		expect(await response.json()).toMatchObject({
			link: { id: "link-1" },
			supplier: { id: "supplier", name: "Supplier", level: 3 },
			reseller: { id: "reseller", name: "Reseller", level: 2 },
			history: [{ id: "audit-1" }],
			purchaseOrders: [{ id: "po-1" }],
			commissions: [{ id: "commission-1" }],
		});
	});
});
