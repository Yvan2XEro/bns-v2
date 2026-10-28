import { describe, expect, test } from "bun:test";
import { categoryTree } from "./categoryTree";

describe("categoryTree", () => {
	const tree = categoryTree([
		{ id: "v", name: "Véhicules" },
		{ id: "e", name: "Électronique", parent: null },
		{ id: "p", name: "Téléphones", parent: { id: "e" } },
		{ id: "o", name: "Ordinateurs", parent: "e" },
		{ id: "s", name: "Smartphones", parent: "p" },
		{ id: "x", name: "Orphan", parent: "missing" },
		{ id: "", name: "No id" },
	]);

	test("rubrics keep API order; an orphan becomes a rubric", () => {
		expect(tree.map((r) => r.id)).toEqual(["v", "e", "x"]);
	});

	test("each rubric carries two levels below it", () => {
		const electronics = tree[1];
		expect(electronics.children.map((g) => g.name)).toEqual([
			"Téléphones",
			"Ordinateurs",
		]);
		expect(electronics.children[0].children.map((c) => c.id)).toEqual(["s"]);
		expect(electronics.children[1].children).toEqual([]);
	});

	test("a picture is its thumbnail when Media made one", () => {
		const [rubric] = categoryTree([
			{
				id: "a",
				name: "A",
				image: {
					url: "https://cdn.example/a.jpg",
					sizes: { thumbnail: { url: "https://cdn.example/a-480.jpg" } },
				},
			},
		]);
		expect(rubric.imageUrl).toEndWith("/a-480.jpg");
	});
});
