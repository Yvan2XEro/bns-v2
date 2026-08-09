import { beforeEach, describe, expect, it, vi } from "vitest";

const getPayloadMock = vi.fn();
const findMock = vi.fn();

vi.mock("@payload-config", () => ({
	default: {},
}));

vi.mock("payload", async (importOriginal) => {
	const actual = await importOriginal<typeof import("payload")>();

	return {
		...actual,
		getPayload: getPayloadMock,
	};
});

describe("public search route", () => {
	beforeEach(() => {
		findMock.mockReset();
		getPayloadMock.mockReset();
		getPayloadMock.mockResolvedValue({
			find: findMock,
		});
		process.env.MEILI_HOST = "http://meili.example.test";
		process.env.MEILI_MASTER_KEY = "test-key";
	});

	it("queries boosted listings from Payload when boosted=true", async () => {
		findMock.mockResolvedValue({
			docs: [
				{
					id: "listing-1",
					title: "Boosted listing",
					description: "Promoted item",
					price: 25000,
					location: "Douala",
					images: [],
					status: "published",
					boostedUntil: "2026-08-20T12:00:00.000Z",
					attributes: {},
					createdAt: "2026-08-09T12:00:00.000Z",
				},
			],
			totalDocs: 1,
		});

		const { GET } = await import(
			"../../src/app/(frontend)/api/public/search/route"
		);

		const response = await GET(
			new Request(
				"http://localhost:3000/api/public/search?boosted=true&sort=boosted&limit=6&offset=0",
			),
		);
		const body = await response.json();

		expect(findMock).toHaveBeenCalledWith({
			collection: "listings",
			where: {
				status: { equals: "published" },
				boostedUntil: { greater_than: expect.any(String) },
			},
			limit: 6,
			page: 1,
			sort: "-boostedUntil",
		});
		expect(body.hits).toHaveLength(1);
		expect(body.hits[0]).toMatchObject({
			id: "listing-1",
			title: "Boosted listing",
			boostedUntil: "2026-08-20T12:00:00.000Z",
		});
	});
});
