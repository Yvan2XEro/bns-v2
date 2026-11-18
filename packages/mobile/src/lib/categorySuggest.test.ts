import { describe, expect, test } from "bun:test";
import {
	createCategorySuggester,
	normalizeText,
	tokenize,
} from "./categorySuggest";

/**
 * A cut-down stand-in for what `/api/public/categories` returns, carrying the
 * aliases and options the real seed defines for these categories. Titles below
 * are the kind sellers actually type, accents and all.
 */
const CATEGORIES = [
	{
		id: "vehicles",
		name: "Vehicles",
		description: "Cars, motorcycles, trucks, and other vehicles",
		searchAliases:
			"vehicule, vehicules, voiture, auto, automobile, car, vehicle",
		parent: null,
		attributes: [
			{
				name: "Vehicle Type",
				options: [
					{ value: "Car" },
					{ value: "Motorcycle" },
					{ value: "Truck" },
				],
			},
		],
	},
	{
		id: "cars",
		name: "Cars",
		description: "Used and new cars for sale",
		searchAliases:
			"voiture, voitures, auto, automobile, bagnole, berline, citadine, 4x4, suv, toyota, hyundai, corolla, hilux, car, sedan",
		parent: "vehicles",
		attributes: [
			{ name: "Brand", options: [{ value: "Toyota" }, { value: "Hyundai" }] },
			{ name: "Fuel", options: [{ value: "Petrol" }, { value: "Diesel" }] },
		],
	},
	{
		id: "electronics",
		name: "Electronics",
		description: "Phones, computers and other devices",
		searchAliases: "electronique, appareil, gadget, electronics, device",
		parent: null,
		attributes: [],
	},
	{
		id: "phones",
		name: "Phones & Tablets",
		description: "Smartphones and tablets",
		searchAliases:
			"telephone, telephones, portable, smartphone, tablette, iphone, tecno, infinix, phone, tablet",
		parent: "electronics",
		attributes: [
			{ name: "Brand", options: [{ value: "Apple" }, { value: "Tecno" }] },
			{ name: "Storage", options: [{ value: "128GB" }, { value: "256GB" }] },
		],
	},
	{
		id: "appliances",
		name: "Appliances",
		description: "Fridges, cookers and washing machines",
		searchAliases:
			"electromenager, frigo, machine a laver, climatiseur, clim, fridge",
		parent: "home-garden",
		attributes: [],
	},
	{
		id: "job-offers",
		name: "Job Offers",
		description: "Positions open for hire",
		searchAliases:
			"offre emploi, offre d emploi, recrutement, recrute, poste, cdi, cdd, stage, hiring",
		parent: "jobs-services",
		attributes: [],
	},
	{
		id: "commercial-property",
		name: "Commercial Property",
		description: "Shops, offices and warehouses",
		searchAliases:
			"local, boutique, magasin, bureau, entrepot, commercial, shop, office",
		parent: "real-estate",
		attributes: [],
	},
];

const suggest = createCategorySuggester(CATEGORIES);

describe("normalizeText", () => {
	test("folds accents without relying on String.normalize", () => {
		expect(normalizeText("Téléphone à vendre")).toBe("telephone a vendre");
		expect(normalizeText("CŒUR — Élégant")).toBe("coeur elegant");
	});

	test("reduces punctuation to single spaces", () => {
		expect(normalizeText("Toyota  Corolla, 2015 (occasion)")).toBe(
			"toyota corolla 2015 occasion",
		);
	});

	test("survives non-string input", () => {
		expect(normalizeText(null)).toBe("");
		expect(normalizeText(undefined)).toBe("");
		expect(normalizeText(42)).toBe("");
	});
});

describe("tokenize", () => {
	test("drops stopwords and ad boilerplate", () => {
		expect(tokenize("Vends une voiture en bon etat urgent")).toEqual([
			"voiture",
		]);
	});

	test("deduplicates so repetition cannot inflate a score", () => {
		expect(tokenize("voiture voiture voiture")).toEqual(["voiture"]);
	});

	test("drops single characters", () => {
		expect(tokenize("A B iphone")).toEqual(["iphone"]);
	});
});

describe("suggestCategory", () => {
	test("prefers the child category over its parent", () => {
		// Both define "voiture"; Cars asks 23 questions where Vehicles asks 5.
		expect(suggest("Vends ma voiture")?.category.id).toBe("cars");
	});

	test("matches on a brand that only one category claims", () => {
		expect(suggest("Toyota Corolla 2015")?.category.id).toBe("cars");
	});

	test("matches an accented title against unaccented aliases", () => {
		expect(suggest("Téléphone Tecno Spark neuf")?.category.id).toBe("phones");
	});

	test("matches a multi-word alias as a phrase", () => {
		expect(suggest("Machine a laver Samsung 7kg")?.category.id).toBe(
			"appliances",
		);
	});

	test("does not match a phrase whose words are merely present", () => {
		// "machine" and "laver" both appear, but not as the alias phrase.
		expect(
			suggest("Machine industrielle pour laver le sable")?.category.id,
		).not.toBe("appliances");
	});

	test("returns nothing for a title that names no category", () => {
		expect(suggest("Bonne affaire a saisir rapidement")).toBeNull();
	});

	test("returns nothing for an empty or trivial title", () => {
		expect(suggest("")).toBeNull();
		expect(suggest("   ")).toBeNull();
		expect(suggest("a")).toBeNull();
	});

	test("refuses to guess when two categories fit equally well", () => {
		// "recrutement" belongs to Job Offers, "commercial" to Commercial Property,
		// and nothing in the title says which one the ad is.
		expect(suggest("Recrutement commercial")).toBeNull();
	});

	test("a description-only hit is too weak to offer", () => {
		// "devices" appears in the Electronics description and nowhere else.
		expect(suggest("devices")).toBeNull();
	});

	test("tolerates a malformed category list", () => {
		const withHoles = createCategorySuggester([
			null as never,
			{ id: "empty" },
			...CATEGORIES,
		]);
		expect(withHoles("Toyota Corolla")?.category.id).toBe("cars");
	});
});

describe("web and mobile stay in sync", () => {
	const START = "// ─── SHARED CORE";
	const END = "// ─── END SHARED CORE";

	function core(source: string): string {
		const from = source.indexOf(START);
		const to = source.indexOf(END);
		expect(from).toBeGreaterThan(-1);
		expect(to).toBeGreaterThan(from);
		// The marker line itself carries a package-specific comment; compare what
		// is between the markers, which is the code.
		return source.slice(source.indexOf("\n", from) + 1, to);
	}

	test("the scoring core is byte-identical in both packages", async () => {
		const mobile = await Bun.file(
			`${import.meta.dir}/categorySuggest.ts`,
		).text();
		const web = await Bun.file(
			`${import.meta.dir}/../../../web/src/lib/category-suggest.ts`,
		).text();

		expect(core(web)).toBe(core(mobile));
	});
});
