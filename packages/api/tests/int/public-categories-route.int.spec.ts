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

describe("public categories route", () => {
	beforeEach(() => {
		findMock.mockReset();
		getPayloadMock.mockReset();
		getPayloadMock.mockResolvedValue({
			find: findMock,
		});
	});

	it("returns all active categories without pagination and respects depth", async () => {
		findMock.mockResolvedValue({
			docs: Array.from({ length: 12 }, (_, index) => ({
				id: `cat-${index + 1}`,
				name: `Category ${index + 1}`,
				slug: `category-${index + 1}`,
				description: null,
				icon: null,
				image: null,
				parent: null,
				attributes: [],
			})),
		});

		const { GET } = await import(
			"../../src/app/(frontend)/api/public/categories/route"
		);

		const response = await GET(
			new Request("http://localhost:3000/api/public/categories?depth=2"),
		);
		const body = await response.json();

		expect(findMock).toHaveBeenCalledWith({
			collection: "categories",
			where: {
				active: { equals: true },
			},
			depth: 2,
			locale: "fr",
			fallbackLocale: "fr",
			limit: 0,
			pagination: false,
		});
		expect(body.categories).toHaveLength(12);
		expect(body.categories[0]).toMatchObject({
			id: "cat-1",
			name: "Category 1",
			slug: "category-1",
		});
	});

	it("passes searchAliases through to the clients", async () => {
		// The ad form guesses a category from the typed title by matching it
		// against these aliases. Dropping the field from the response would not
		// fail anywhere — the guess would just quietly stop working.
		findMock.mockResolvedValue({
			docs: [
				{
					id: "cat-cars",
					name: "Cars",
					slug: "cars",
					description: "Used and new cars for sale",
					searchAliases: "voiture, bagnole, toyota",
					icon: null,
					image: null,
					parent: "cat-vehicles",
					attributes: [],
				},
			],
		});

		const { GET } = await import(
			"../../src/app/(frontend)/api/public/categories/route"
		);

		const response = await GET(
			new Request("http://localhost:3000/api/public/categories"),
		);
		const body = await response.json();

		expect(body.categories[0].searchAliases).toBe("voiture, bagnole, toyota");
	});

	it("answers in the language the client asks for, French by default", async () => {
		findMock.mockResolvedValue({ docs: [] });
		const { GET } = await import(
			"../../src/app/(frontend)/api/public/categories/route"
		);
		const localeOfCall = (index: number) => {
			const args = findMock.mock.calls[index][0] as {
				locale: string;
				fallbackLocale: string;
			};
			return [args.locale, args.fallbackLocale];
		};

		await GET(
			new Request("http://localhost:3000/api/public/categories", {
				headers: { "Accept-Language": "en-GB,en;q=0.9,fr;q=0.8" },
			}),
		);
		await GET(
			new Request("http://localhost:3000/api/public/categories?locale=en", {
				headers: { "Accept-Language": "fr" },
			}),
		);
		await GET(new Request("http://localhost:3000/api/public/categories"));
		await GET(
			new Request("http://localhost:3000/api/public/categories?slug=cars", {
				headers: { "Accept-Language": "en" },
			}),
		);

		expect(localeOfCall(0)).toEqual(["en", "fr"]);
		expect(localeOfCall(1)).toEqual(["en", "fr"]);
		expect(localeOfCall(2)).toEqual(["fr", "fr"]);
		expect(localeOfCall(3)).toEqual(["en", "fr"]);
	});
});
