import { describe, expect, test } from "bun:test";
import type { Category } from "~/types";
import { parseCsv, parseProductImport } from "./product-import";

const categories = [
	{
		id: "c-1",
		name: "Téléphones",
		slug: "telephones",
		attributes: [{ name: "État", slug: "condition", type: "select" }],
	},
	{ id: "c-2", name: "Accessoires", slug: "accessoires" },
] as unknown as Category[];

describe("parseCsv", () => {
	test("reads quoted cells, escaped quotes and either separator", () => {
		expect(parseCsv('a;"b;c";"d ""e"""\n1;2;3\n')).toEqual([
			["a", "b;c", 'd "e"'],
			["1", "2", "3"],
		]);
		expect(parseCsv("a,b\r\n1,2")).toEqual([
			["a", "b"],
			["1", "2"],
		]);
	});
});

describe("parseProductImport", () => {
	test("builds one draft single-variant product per valid line", () => {
		const { rows, fileErrors } = parseProductImport(
			"Titre;Catégorie;Prix;SKU;Stock;Coût;État\nGalaxy A55;Téléphones;168 000;AT-A55;7;140000;neuf\n",
			categories,
			{ includeCost: true },
		);
		expect(fileErrors).toEqual([]);
		expect(rows[0].errors).toEqual([]);
		expect(rows[0].input).toEqual({
			title: "Galaxy A55",
			category: "c-1",
			description: null,
			attributes: { condition: "new" },
			status: "draft",
			options: [],
			variants: [
				{
					optionValues: {},
					sku: "AT-A55",
					price: 168000,
					trackInventory: true,
					initialStock: 7,
					cost: 140000,
				},
			],
		});
	});

	test("drops the condition of a category that does not ask for one", () => {
		const { rows } = parseProductImport(
			"titre;categorie;prix;etat\nChargeur 20 W;accessoires;9000;neuf\n",
			categories,
			{ includeCost: false },
		);
		expect(rows[0].errors).toEqual([]);
		expect(rows[0].input).not.toHaveProperty("attributes");
	});

	test("never sends a cost for a member who may not see costs", () => {
		const { rows } = parseProductImport(
			"titre;categorie;prix;cout\nChargeur 20 W;accessoires;9000;5000\n",
			categories,
			{ includeCost: false },
		);
		expect(rows[0].input?.variants[0]).not.toHaveProperty("cost");
	});

	test("flags each bad cell and a SKU repeated in the file", () => {
		const { rows } = parseProductImport(
			"titre;categorie;prix;sku;stock\nAB;Inconnue;0;X;-1\nCâble USB;Accessoires;1500;X;\n",
			categories,
			{ includeCost: false },
		);
		expect(rows[0]).toMatchObject({
			line: 2,
			input: null,
			errors: ["title", "category", "price", "stock"],
		});
		expect(rows[1].errors).toEqual(["duplicateSku"]);
	});

	test("matches a category by its name in the other language, slug first", () => {
		const { rows } = parseProductImport(
			"titre;categorie;prix\nCâble USB;Phones › Accessories;1500\nCoque;telephones;2000\n",
			categories,
			{
				includeCost: false,
				otherCategoryNames: { "c-1": "Phones", "c-2": "Accessories" },
			},
		);
		expect(rows.map((row) => row.input?.category)).toEqual(["c-2", "c-1"]);
	});

	test("refuses a file without the required columns", () => {
		expect(
			parseProductImport("nom;prix\nX;1\n", categories, { includeCost: false })
				.fileErrors,
		).toEqual(["missingColumns"]);
	});
});
