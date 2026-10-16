// @vitest-environment node
import { describe, expect, it } from "vitest";
import {
	conditionAttributeOf,
	conditionLabelOf,
} from "../../src/contracts/conditionAttribute";
import { migrateConditionToAttribute } from "../../src/migrations/conditionToAttribute";
import { withRawMongo } from "./helpers/fakeMongo";
import { type Doc, fakePayload } from "./helpers/fakePayload";

const seed = () =>
	withRawMongo(
		fakePayload({
			categories: [
				{
					id: "veh",
					slug: "vehicles",
					listingForm: { type: "product", condition: "auto" },
					attributes: [],
				},
				{
					id: "cars",
					slug: "cars",
					parent: "veh",
					listingForm: { type: "auto", condition: "auto" },
					attributes: [{ name: "Brand", slug: "brand", type: "text" }],
				},
				{ id: "real", slug: "real-estate", listingForm: { type: "rental" } },
				{ id: "apts", slug: "apartments", parent: "real" },
				{
					id: "oth",
					slug: "other",
					listingForm: { type: "product", condition: "required" },
				},
				{
					id: "fash",
					slug: "fashion",
					listingForm: { type: "product" },
					attributes: [
						{
							name: "État",
							slug: "etat",
							type: "select",
							options: [{ value: "Neuf" }, { value: "Bon état" }],
						},
					],
				},
				{
					id: "svc",
					slug: "services",
					listingForm: { type: "service", condition: "optional" },
				},
			],
			listings: [
				{
					id: "l-car",
					category: "cars",
					condition: "good",
					attributes: { brand: "Toyota" },
				},
				{ id: "l-new", category: "fash", condition: "new" },
				{ id: "l-poor", category: "fash", condition: "poor" },
				{
					id: "l-dup",
					category: "fash",
					condition: "good",
					attributes: { etat: "Neuf" },
				},
				{ id: "l-flat", category: "apts", condition: "like_new" },
				{ id: "l-empty", category: "oth", condition: null },
				{ id: "l-svc", category: "svc", condition: "fair" },
				{ id: "l-none", category: "cars", attributes: { brand: "Kia" } },
			],
			products: [{ id: "p-car", category: "cars", condition: "new" }],
		}),
	);

const byId = (rows: Doc[] | undefined, id: string) =>
	rows?.find((row) => row.id === id) as Doc;

const attributeSlugs = (category: Doc) =>
	(category.attributes as Doc[]).map((attribute) => attribute.slug);

describe("condition to attribute migration", () => {
	it("adds « État » where the form showed condition, and only there", async () => {
		const payload = seed();
		await migrateConditionToAttribute(payload);
		const categories = payload.store.categories;
		expect(attributeSlugs(byId(categories, "veh"))).toEqual(["condition"]);
		expect(attributeSlugs(byId(categories, "cars"))).toEqual([
			"condition",
			"brand",
		]);
		expect(attributeSlugs(byId(categories, "svc"))).toEqual(["condition"]);
		expect(byId(categories, "apts").attributes).toBeUndefined();
		expect(attributeSlugs(byId(categories, "fash"))).toEqual(["etat"]);

		const added = (byId(categories, "oth").attributes as Doc[])[0];
		expect(added).toMatchObject({
			name: "État",
			slug: "condition",
			type: "select",
			required: true,
			filterable: true,
		});
		expect(added.options).toEqual([
			expect.objectContaining({ value: "new", label: "Neuf" }),
			expect.objectContaining({ value: "like_new", label: "Comme neuf" }),
			expect.objectContaining({ value: "good", label: "Bon état" }),
			expect.objectContaining({ value: "fair", label: "État correct" }),
			expect.objectContaining({ value: "poor", label: "Mauvais état" }),
		]);
		expect((byId(categories, "cars").attributes as Doc[])[0].required).toBe(
			false,
		);
		for (const category of categories) {
			expect(
				(category.listingForm as Doc | undefined)?.condition,
			).toBeUndefined();
		}
	});

	it("copies every value into the attributes and removes the field", async () => {
		const payload = seed();
		const report = await migrateConditionToAttribute(payload);
		const listing = (id: string) => byId(payload.store.listings, id);

		expect(listing("l-car").attributes).toEqual({
			brand: "Toyota",
			condition: "good",
		});
		expect(listing("l-new").attributes).toEqual({ etat: "Neuf" });
		expect(listing("l-poor").attributes).toEqual({ etat: "poor" });
		expect(listing("l-dup").attributes).toEqual({ etat: "Neuf" });
		expect(listing("l-flat").attributes).toEqual({ condition: "like_new" });
		expect(listing("l-svc").attributes).toEqual({ condition: "fair" });
		expect(listing("l-none").attributes).toEqual({ brand: "Kia" });
		expect(byId(payload.store.products, "p-car").attributes).toEqual({
			condition: "new",
		});
		for (const row of [...payload.store.listings, ...payload.store.products]) {
			expect(row).not.toHaveProperty("condition");
		}

		const fashion = byId(payload.store.categories, "fash");
		expect((fashion.attributes as Doc[])[0].options).toEqual([
			{ value: "Neuf" },
			{ value: "Bon état" },
			expect.objectContaining({ value: "poor", label: "Mauvais état" }),
		]);
		expect(report).toEqual({
			attributesAdded: 4,
			attributesReused: 1,
			optionsAppended: 1,
			listingsCopied: 5,
			productsCopied: 1,
			keptExistingValue: 1,
			orphaned: 1,
			categoriesCleared: 4,
		});
	});

	it("reads back as the label the category gives the value", async () => {
		const payload = seed();
		await migrateConditionToAttribute(payload);
		const cars = byId(payload.store.categories, "cars");
		const fashion = byId(payload.store.categories, "fash");
		expect(
			conditionLabelOf(
				cars.attributes as Doc[],
				byId(payload.store.listings, "l-car").attributes,
			),
		).toBe("Bon état");
		expect(
			conditionLabelOf(
				fashion.attributes as Doc[],
				byId(payload.store.listings, "l-poor").attributes,
			),
		).toBe("Mauvais état");
		expect(conditionLabelOf([], { brand: "x" })).toBeNull();
	});

	it("changes nothing on a second run", async () => {
		const payload = seed();
		await migrateConditionToAttribute(payload);
		const before = structuredClone(payload.store);
		const again = await migrateConditionToAttribute(payload);
		expect(payload.store.categories).toEqual(before.categories);
		expect(payload.store.listings).toEqual(before.listings);
		expect(payload.store.products).toEqual(before.products);
		expect(again).toMatchObject({
			attributesAdded: 0,
			optionsAppended: 0,
			listingsCopied: 0,
			productsCopied: 0,
			categoriesCleared: 0,
		});
	});

	it("recognises an already localised « État » and adds no second one", async () => {
		const payload = withRawMongo(
			fakePayload({
				categories: [
					{
						id: "fash",
						slug: "fashion",
						listingForm: { type: "product", condition: "auto" },
						attributes: [
							{
								name: { fr: "État", en: "Condition" },
								slug: "etat",
								type: "select",
								options: [
									{ value: "new", label: { fr: "Neuf", en: "New" } },
									{
										value: "used",
										label: { fr: "Bon état", en: "Good condition" },
									},
								],
							},
						],
					},
				],
				listings: [{ id: "l-good", category: "fash", condition: "good" }],
			}),
		);
		const report = await migrateConditionToAttribute(payload);
		const fashion = byId(payload.store.categories, "fash");

		expect(attributeSlugs(fashion)).toEqual(["etat"]);
		expect(report).toMatchObject({ attributesAdded: 0, optionsAppended: 0 });
		expect(byId(payload.store.listings, "l-good").attributes).toEqual({
			etat: "used",
		});
		expect(conditionLabelOf(fashion.attributes as Doc[], { etat: "new" })).toBe(
			"Neuf",
		);
		expect(
			conditionAttributeOf([
				{ name: { en: "Condition" }, slug: "wear", type: "text" },
			]),
		).not.toBeNull();
	});
});
