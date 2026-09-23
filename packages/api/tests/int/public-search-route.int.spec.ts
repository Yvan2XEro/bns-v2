import { beforeEach, describe, expect, it, vi } from "vitest";

const getPayloadMock = vi.fn();
const findMock = vi.fn();
const searchMock = vi.fn();

vi.mock("@payload-config", () => ({
	default: {},
}));
// The alias above does not resolve to the same module id as the real
// `import config from "@payload-config"` in route.ts inside this test's
// module graph, so it never intercepts; mock the concrete file too.
vi.mock("../../src/payload.config.ts", () => ({
	default: {},
}));

vi.mock("meilisearch", () => ({
	MeiliSearch: class {
		index() {
			return { search: searchMock };
		}
	},
}));

vi.mock("payload", () => ({ getPayload: getPayloadMock }));

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
			shopId: null,
			shopHandle: null,
			shopName: null,
			shopLevel: null,
			priceMax: null,
			available: null,
		});
		// First test in the file, so it pays for importing the route and its
		// Payload config; that alone can outlast the 5s default.
	}, 10000);

	it("surfaces a listing's flat shop fields from a Meilisearch hit", async () => {
		searchMock.mockResolvedValueOnce({
			hits: [
				{
					id: "listing-9",
					title: "From the shop, via Meilisearch",
					status: "published",
					shopId: "shop-9",
					shopHandle: "akwatech",
					shopName: "Akwa Tech",
					shopLevel: 2,
					priceMax: 5000,
					available: 3,
				},
			],
			estimatedTotalHits: 1,
		});
		// The live insurance check behind the index confirms shop-9 is active.
		findMock.mockResolvedValueOnce({
			docs: [{ id: "shop-9", status: "active" }],
			totalDocs: 1,
		});

		const { GET } = await import(
			"../../src/app/(frontend)/api/public/search/route"
		);
		const response = await GET(
			new Request("http://localhost:3000/api/public/search"),
		);
		const body = await response.json();

		expect(findMock).toHaveBeenCalledWith(
			expect.objectContaining({
				collection: "shops",
				where: {
					and: [{ id: { in: ["shop-9"] } }, { status: { equals: "active" } }],
				},
			}),
		);
		expect(body.hits[0]).toMatchObject({
			shopId: "shop-9",
			shopHandle: "akwatech",
			shopName: "Akwa Tech",
			shopLevel: 2,
			priceMax: 5000,
			available: 3,
		});
	});

	it("blanks a Meilisearch hit's shop fields when a live check finds the shop no longer active", async () => {
		// A stale index document: the shop was suspended after it was indexed,
		// and the `shop.updated` event that should have corrected it never
		// arrived (the publish is fire-and-forget — see searchEvents.ts).
		searchMock.mockResolvedValueOnce({
			hits: [
				{
					id: "listing-10",
					title: "Stale index entry",
					status: "published",
					shopId: "shop-suspended",
					shopHandle: "wasactive",
					shopName: "Was Active Shop",
					shopLevel: 3,
				},
			],
			estimatedTotalHits: 1,
		});
		findMock.mockResolvedValueOnce({ docs: [], totalDocs: 0 });

		const { GET } = await import(
			"../../src/app/(frontend)/api/public/search/route"
		);
		const response = await GET(
			new Request("http://localhost:3000/api/public/search"),
		);
		const body = await response.json();

		expect(body.hits[0]).toMatchObject({
			shopHandle: null,
			shopName: null,
			shopLevel: null,
		});
	});

	it("never queries Payload for the live shop check when no hit carries a shop id", async () => {
		searchMock.mockResolvedValueOnce({
			hits: [{ id: "listing-11", title: "Classified", status: "published" }],
			estimatedTotalHits: 1,
		});

		const { GET } = await import(
			"../../src/app/(frontend)/api/public/search/route"
		);
		await GET(new Request("http://localhost:3000/api/public/search"));

		expect(findMock).not.toHaveBeenCalled();
	});

	it("falls back to Payload when the live shop status check itself fails", async () => {
		// A database hiccup during the insurance check is not a Meilisearch
		// failure and should not 500 a search that otherwise succeeded.
		searchMock.mockResolvedValueOnce({
			hits: [
				{
					id: "listing-12",
					title: "From Meilisearch",
					status: "published",
					shopId: "shop-12",
					shopHandle: "akwatech",
					shopName: "Akwa Tech",
					shopLevel: 1,
				},
			],
			estimatedTotalHits: 1,
		});
		findMock.mockImplementation(async (args: { collection: string }) => {
			if (args.collection === "shops") {
				throw new Error("connection reset");
			}
			return {
				docs: [
					{
						id: "listing-12",
						title: "From Payload fallback",
						status: "published",
					},
				],
				totalDocs: 1,
			};
		});

		const { GET } = await import(
			"../../src/app/(frontend)/api/public/search/route"
		);
		const response = await GET(
			new Request("http://localhost:3000/api/public/search"),
		);

		expect(response.status).toBe(200);
		const body = await response.json();
		expect(body.hits).toHaveLength(1);
		expect(body.hits[0].id).toBe("listing-12");
	});

	it("clamps an oversized limit like the shops route caps its own", async () => {
		searchMock.mockResolvedValueOnce({ hits: [], estimatedTotalHits: 0 });

		const { GET } = await import(
			"../../src/app/(frontend)/api/public/search/route"
		);
		const response = await GET(
			new Request("http://localhost:3000/api/public/search?limit=999999"),
		);
		const body = await response.json();

		expect(body.limit).toBe(50);
		expect(searchMock.mock.calls.at(-1)?.[1]?.limit).toBe(50);
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

		it("quotes a category id instead of splicing it into the filter", async () => {
			const filter = await filterFor(
				`category=${encodeURIComponent('abc" OR status = draft')}`,
			);
			expect(filter).toContain('categoryId = "abc\\" OR status = draft"');
		});

		it("quotes a location instead of splicing it into the filter", async () => {
			const filter = await filterFor(
				`location=${encodeURIComponent('Douala" OR x = 1')}`,
			);
			expect(filter).toContain('location = "Douala\\" OR x = 1"');
		});

		it("quotes each condition instead of splicing it into the filter", async () => {
			const filter = await filterFor(
				`condition=${encodeURIComponent('new" OR 1=1 --')}`,
			);
			expect(filter).toContain('condition IN ["new\\" OR 1=1 --"]');
		});

		it("quotes each tag instead of splicing it into the filter", async () => {
			const filter = await filterFor(
				`tags=${encodeURIComponent('deal" OR 1=1 --')}`,
			);
			expect(filter).toContain('tags IN ["deal\\" OR 1=1 --"]');
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

		it("filters by shop with the value quoted", async () => {
			expect(await filterFor('shop=abc"def')).toContain('shopId = "abc\\"def"');
		});

		it("falls back to Payload when Meilisearch cannot satisfy the shop filter", async () => {
			// `shopId` is not filterable on the real index yet (Task 14's job) —
			// this is what that rejection looks like today.
			searchMock.mockRejectedValueOnce(
				new Error("Attribute `shopId` is not filterable"),
			);
			findMock.mockImplementation(async (args: { collection: string }) => {
				if (args.collection === "shops") {
					return { docs: [{ id: "s-1", status: "active" }], totalDocs: 1 };
				}
				return {
					docs: [{ id: "listing-1", title: "From the shop", shop: "s-1" }],
					totalDocs: 1,
				};
			});

			const { GET } = await import(
				"../../src/app/(frontend)/api/public/search/route"
			);
			const response = await GET(
				new Request("http://localhost:3000/api/public/search?shop=s-1"),
			);

			expect(response.status).toBe(200);
			const body = await response.json();
			expect(body.hits).toHaveLength(1);
			expect(body.hits[0]).toMatchObject({ id: "listing-1" });
		});
	});

	describe("shop filter", () => {
		beforeEach(() => {
			// `process.env.X = undefined` coerces to the string "undefined", which
			// stays truthy for `!host` — only `delete` genuinely unsets it.
			// biome-ignore lint/performance/noDelete: see above
			delete process.env.MEILI_HOST;
		});

		it("queries Payload directly, guarded by the shop's active status", async () => {
			findMock.mockImplementation(async (args: { collection: string }) => {
				if (args.collection === "shops") {
					return { docs: [{ id: "s-1", status: "active" }], totalDocs: 1 };
				}
				return {
					docs: [
						{
							id: "listing-1",
							title: "From the shop",
							shop: {
								id: "s-1",
								handle: "akwatech",
								name: "Akwa Tech",
								level: 2,
								status: "active",
							},
						},
					],
					totalDocs: 1,
				};
			});

			const { GET } = await import(
				"../../src/app/(frontend)/api/public/search/route"
			);
			const response = await GET(
				new Request("http://localhost:3000/api/public/search?shop=s-1"),
			);
			const body = await response.json();

			expect(findMock).toHaveBeenCalledWith(
				expect.objectContaining({
					collection: "shops",
					where: { id: { equals: "s-1" } },
				}),
			);
			expect(findMock).toHaveBeenCalledWith(
				expect.objectContaining({
					collection: "listings",
					where: expect.objectContaining({ shop: { equals: "s-1" } }),
				}),
			);
			expect(body.hits[0]).toMatchObject({
				shopId: "s-1",
				shopHandle: "akwatech",
				shopName: "Akwa Tech",
				shopLevel: 2,
			});
		});

		it("answers no hits, and never queries listings, when the shop is missing or not active", async () => {
			findMock.mockImplementation(async (args: { collection: string }) => {
				if (args.collection === "shops") return { docs: [], totalDocs: 0 };
				throw new Error(
					"must not query listings once the shop failed the active check",
				);
			});

			const { GET } = await import(
				"../../src/app/(frontend)/api/public/search/route"
			);
			const response = await GET(
				new Request("http://localhost:3000/api/public/search?shop=s-suspended"),
			);

			expect(await response.json()).toEqual({
				hits: [],
				total: 0,
				limit: 20,
				offset: 0,
			});
		});

		it("never surfaces a listing's shop name or handle once that shop is no longer active", async () => {
			findMock.mockResolvedValue({
				docs: [
					{
						id: "listing-1",
						title: "Stale hit",
						shop: {
							id: "s-2",
							handle: "closedshop",
							name: "Closed Shop",
							level: 1,
							status: "suspended",
						},
					},
				],
				totalDocs: 1,
			});

			const { GET } = await import(
				"../../src/app/(frontend)/api/public/search/route"
			);
			const response = await GET(
				new Request("http://localhost:3000/api/public/search"),
			);
			const body = await response.json();

			expect(body.hits[0]).toMatchObject({
				shopId: "s-2",
				shopHandle: null,
				shopName: null,
				shopLevel: null,
			});
		});
	});
});

describe("public shops search route", () => {
	beforeEach(() => {
		searchMock.mockReset();
		searchMock.mockResolvedValue({
			hits: [
				{
					id: "s-1",
					handle: "akwatech",
					name: "Akwa",
					description: null,
					city: "Douala",
					level: 1,
					publishedListingCount: 3,
					logoUrl: null,
					ownerRating: 4,
					ownerReviews: 2,
					createdAt: "x",
					categoryIds: [],
				},
			],
			estimatedTotalHits: 1,
		});
		// The live insurance check confirms s-1 is active by default; individual
		// tests override this to simulate a stale index document.
		findMock.mockReset();
		getPayloadMock.mockResolvedValue({ find: findMock });
		findMock.mockResolvedValue({
			docs: [{ id: "s-1", status: "active" }],
			totalDocs: 1,
		});
		process.env.MEILI_HOST = "http://meili.example.test";
	});

	it("quotes city and category and maps hits", async () => {
		const { GET } = await import(
			"../../src/app/(frontend)/api/public/search/shops/route"
		);
		const res = await GET(
			new Request(
				'http://x/api/public/search/shops?q=tel&city=Dou"ala&category=c-1',
			),
		);
		const body = await res.json();
		expect(searchMock.mock.calls.at(-1)?.[1]?.filter).toBe(
			'city = "Dou\\"ala" AND categoryIds = "c-1"',
		);
		expect(body).toEqual({
			hits: [
				{
					id: "s-1",
					handle: "akwatech",
					name: "Akwa",
					description: null,
					city: "Douala",
					level: 1,
					publishedListingCount: 3,
					logoUrl: null,
					ownerRating: 4,
					ownerReviews: 2,
					createdAt: "x",
				},
			],
			total: 1,
			limit: 20,
			offset: 0,
		});
	});

	it("drops a stale index document once a live check finds the shop no longer active", async () => {
		// The shop was suspended or closed after it was indexed, and the
		// `shop.updated`/`shop.deleted` event that should have corrected the
		// index never arrived (the publish is fire-and-forget).
		findMock.mockResolvedValueOnce({ docs: [], totalDocs: 0 });

		const { GET } = await import(
			"../../src/app/(frontend)/api/public/search/shops/route"
		);
		const res = await GET(new Request("http://x/api/public/search/shops"));
		const body = await res.json();

		expect(findMock).toHaveBeenCalledWith(
			expect.objectContaining({
				collection: "shops",
				where: {
					and: [{ id: { in: ["s-1"] } }, { status: { equals: "active" } }],
				},
			}),
		);
		expect(body.hits).toEqual([]);
	});

	it("queries Payload directly when MEILI_HOST is unset", async () => {
		// biome-ignore lint/performance/noDelete: an undefined assignment coerces to the string "undefined", which stays truthy
		delete process.env.MEILI_HOST;
		findMock.mockReset();
		getPayloadMock.mockResolvedValue({ find: findMock });
		findMock.mockResolvedValue({
			docs: [
				{ id: "s-1", handle: "akwatech", name: "Akwa Tech", status: "active" },
			],
			totalDocs: 1,
		});

		const { GET } = await import(
			"../../src/app/(frontend)/api/public/search/shops/route"
		);
		const res = await GET(
			new Request("http://x/api/public/search/shops?city=Douala"),
		);
		const body = await res.json();

		expect(searchMock).not.toHaveBeenCalled();
		expect(findMock).toHaveBeenCalledWith(
			expect.objectContaining({
				collection: "shops",
				where: {
					and: [
						{ status: { equals: "active" } },
						{ "location.city": { equals: "Douala" } },
					],
				},
			}),
		);
		expect(body.hits).toEqual([
			expect.objectContaining({ id: "s-1", handle: "akwatech" }),
		]);
	});

	it("falls back to Payload when Meilisearch has no shops index to search", async () => {
		searchMock.mockRejectedValueOnce(new Error("Index `shops` not found"));
		findMock.mockReset();
		getPayloadMock.mockResolvedValue({ find: findMock });
		findMock.mockResolvedValue({
			docs: [
				{ id: "s-1", handle: "akwatech", name: "Akwa Tech", status: "active" },
			],
			totalDocs: 1,
		});

		const { GET } = await import(
			"../../src/app/(frontend)/api/public/search/shops/route"
		);
		const res = await GET(new Request("http://x/api/public/search/shops"));

		expect(res.status).toBe(200);
		const body = await res.json();
		expect(body.hits).toEqual([
			expect.objectContaining({ id: "s-1", handle: "akwatech" }),
		]);
	});
});
