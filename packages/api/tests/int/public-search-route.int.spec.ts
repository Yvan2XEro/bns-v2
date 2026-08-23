import { beforeEach, describe, expect, it, vi } from "vitest";

const getPayloadMock = vi.fn();
const findMock = vi.fn();
const searchMock = vi.fn();

vi.mock("@payload-config", () => ({
	default: {},
}));

vi.mock("meilisearch", () => ({
	MeiliSearch: class {
		index() {
			return { search: searchMock };
		}
	},
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
		searchMock.mockReset();
		searchMock.mockResolvedValue({ hits: [], estimatedTotalHits: 0 });
		getPayloadMock.mockResolvedValue({
			find: findMock,
		});
		process.env.MEILI_HOST = "http://meili.example.test";
		process.env.MEILI_MASTER_KEY = "test-key";
	});

	/** The filter expression the route handed to Meilisearch. */
	async function filterFor(queryString: string): Promise<string> {
		const { GET } = await import(
			"../../src/app/(frontend)/api/public/search/route"
		);
		await GET(
			new Request(`http://localhost:3000/api/public/search?${queryString}`),
		);
		return searchMock.mock.calls.at(-1)?.[1]?.filter ?? "";
	}

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

	describe("category attribute filters", () => {
		it("matches an exact value", async () => {
			expect(await filterFor("attr_fuel-type=Diesel")).toContain(
				'fuel-type = "Diesel"',
			);
		});

		it("reads a comma-separated list as any-of", async () => {
			expect(await filterFor("attr_brand=Toyota,Hyundai")).toContain(
				'brand IN ["Toyota", "Hyundai"]',
			);
		});

		it("reads a leading operator as a numeric bound", async () => {
			expect(await filterFor("attr_year=%3E%3D2015")).toContain("year >= 2015");
			expect(await filterFor("attr_mileage=%3C100000")).toContain(
				"mileage < 100000",
			);
		});

		it("drops a bound that is not a number rather than sending NaN", async () => {
			// `year >= NaN` is rejected by Meilisearch, which surfaced as a 500.
			const filter = await filterFor("attr_year=%3E%3Dsoon");
			expect(filter).not.toContain("year");
			expect(filter).not.toContain("NaN");
		});

		it("escapes a value carrying a quote", async () => {
			// Unescaped, this closed the string and left `OR 1=1` in the expression.
			const filter = await filterFor("attr_model=%22%20OR%201%3D1%20--");
			expect(filter).toContain('model = "\\" OR 1=1 --"');
		});

		it("ignores a parameter whose slug is not one of ours", async () => {
			const filter = await filterFor("attr_DROP%20TABLE=x");
			expect(filter).not.toContain("DROP");
		});

		it("answers 503 rather than crashing when the filter is refused", async () => {
			// Meilisearch refuses a filter on an attribute the index does not list
			// as filterable — which is what every category filter did in production.
			searchMock.mockRejectedValueOnce(
				new Error("Attribute `platform` is not filterable"),
			);

			const { GET } = await import(
				"../../src/app/(frontend)/api/public/search/route"
			);
			const response = await GET(
				new Request(
					"http://localhost:3000/api/public/search?attr_platform=Xbox",
				),
			);

			expect(response.status).toBe(503);
			expect((await response.json()).code).toBe("search.unavailable");
		});
	});
});
