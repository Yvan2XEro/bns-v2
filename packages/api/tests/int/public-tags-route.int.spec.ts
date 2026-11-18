// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fakePayload } from "./helpers/fakePayload";

const getPayloadMock = vi.fn();
vi.mock("@payload-config", () => ({ default: {} }));
vi.mock("../../src/payload.config.ts", () => ({ default: {} }));
vi.mock("payload", () => ({ getPayload: getPayloadMock }));

const tagsFor = async (query: string) => {
	const { GET } = await import(
		"../../src/app/(frontend)/api/public/tags/route"
	);
	const response = await GET(
		new Request(`http://localhost:3000/api/public/tags${query}`),
	);
	return ((await response.json()) as { slug: string }[]).map((t) => t.slug);
};

describe("GET /api/public/tags", () => {
	beforeEach(() => {
		getPayloadMock.mockResolvedValue(
			fakePayload({
				categories: [
					{ id: "leisure" },
					{ id: "sport", parent: "leisure" },
					{ id: "holiday", parent: "leisure" },
				],
				tags: [
					{
						id: "t-1",
						name: "Négociable",
						slug: "negotiable",
						categories: ["leisure"],
					},
					{
						id: "t-2",
						name: "Livraison",
						slug: "delivery",
						categories: ["sport"],
					},
					{ id: "t-3", name: "Partout", slug: "nowhere", categories: [] },
				],
			}),
		);
	});

	it("answers the tags of the category and its ancestors", async () => {
		expect(await tagsFor("?category=sport")).toEqual([
			"delivery",
			"negotiable",
		]);
		expect(await tagsFor("?category=holiday")).toEqual(["negotiable"]);
	});

	it("answers nothing without a category, or for an unknown one", async () => {
		expect(await tagsFor("")).toEqual([]);
		expect(await tagsFor("?category=missing")).toEqual([]);
	});
});
