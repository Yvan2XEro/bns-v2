// @vitest-environment node
import { ObjectId } from "mongodb";
import type { Payload } from "payload";
import { describe, expect, it } from "vitest";
import { Categories } from "../../src/collections/Categories";
import {
	flattenCategoryLabels,
	localizeCategoryLabels,
} from "../../src/migrations/categoryLocales";
import {
	CATEGORY_LABELS_FR,
	type CategoryLabelKind,
	frenchSeedAttribute,
	SEEDED_IN_FRENCH,
	seedLabelTranslation,
} from "../../src/seed/categoryTranslations";
import { seededDefinitions } from "../../src/seed/seedCategories";
import { withFrenchLabels } from "../../src/services/categoryCatchUp";

type Doc = Record<string, unknown>;

/** A deep copy that keeps ObjectIds as ObjectIds, as the driver hands them out. */
const clone = <T>(value: T): T => {
	if (value instanceof ObjectId) return new ObjectId(value.toHexString()) as T;
	if (Array.isArray(value)) return value.map(clone) as T;
	if (value && typeof value === "object")
		return Object.fromEntries(
			Object.entries(value).map(([k, v]) => [k, clone(v)]),
		) as T;
	return value;
};

/**
 * A raw categories collection that keeps `_id` and `parent` as real
 * ObjectIds, and matches `_id` the way the driver does: an ObjectId filter
 * finds the row, a hex string does not.
 */
function rawCategories(docs: Doc[]) {
	const sameId = (a: unknown, b: unknown) =>
		a instanceof ObjectId && b instanceof ObjectId ? a.equals(b) : a === b;
	const writes: Doc[] = [];
	const collection = {
		find(_filter: Doc = {}) {
			const rows = docs.map(clone);
			return {
				async *[Symbol.asyncIterator]() {
					yield* rows;
				},
			};
		},
		async updateOne(filter: Doc, update: { $set: Doc }) {
			writes.push(filter);
			const row = docs.find((doc) => sameId(doc._id, filter._id));
			if (!row) return { matchedCount: 0 };
			for (const [path, value] of Object.entries(update.$set)) {
				const keys = path.split(".");
				let cursor = row as Doc;
				for (const key of keys.slice(0, -1)) {
					cursor[key] ??= {};
					cursor = cursor[key] as Doc;
				}
				cursor[keys[keys.length - 1]] = value;
			}
			return { matchedCount: 1 };
		},
	};
	const payload = {
		db: { collections: { categories: { collection } } },
	} as unknown as Payload;
	return { payload, writes };
}

const rowId = () => new ObjectId().toHexString();

function fixture() {
	const vehiclesId = new ObjectId();
	const carsId = new ObjectId();
	const adminId = new ObjectId();
	const editedId = new ObjectId();
	const seededId = new ObjectId();
	const docs: Doc[] = [
		{
			_id: vehiclesId,
			slug: "vehicles",
			name: "Vehicles",
			description: "Cars, motorcycles, trucks, and other vehicles",
			parent: null,
			listingForm: { type: "product" },
			attributes: [],
		},
		{
			_id: carsId,
			slug: "cars",
			name: "Cars",
			description: "Used and new cars for sale",
			parent: vehiclesId,
			attributes: [
				{
					id: rowId(),
					name: "État",
					slug: "condition",
					type: "select",
					options: [
						{ id: rowId(), value: "new", label: "Neuf" },
						{ id: rowId(), value: "good", label: "Bon état" },
					],
				},
				{
					id: rowId(),
					name: "Fuel Type",
					slug: "fuel-type",
					type: "select",
					group: "Engine & Performance",
					options: [
						{ id: rowId(), value: "Petrol" },
						{ id: rowId(), value: "Diesel" },
						{ id: rowId(), value: "Black", label: "Noir mat" },
					],
				},
				{
					id: rowId(),
					name: "Power",
					slug: "power",
					type: "number",
					unit: "hp",
				},
			],
		},
		{
			// An admin's own category: nothing the seed wrote.
			_id: adminId,
			slug: "bikes-parts",
			name: "Pièces vélo",
			description: "",
			parent: vehiclesId,
			listingForm: { type: "auto", priceLabel: "Prix du lot" },
			attributes: [
				{
					id: rowId(),
					name: "Kilométrage réel",
					slug: "real-km",
					type: "text",
				},
			],
		},
		{
			// Already localised, and edited by an admin in both languages.
			_id: editedId,
			slug: "motorcycles",
			name: { fr: "Deux-roues", en: "Motorcycles" },
			description: { fr: "Mes motos", en: "Motorcycles, scooters, and ATVs" },
			parent: vehiclesId,
			attributes: [
				{
					id: rowId(),
					name: { fr: "Marque du constructeur", en: "Brand" },
					slug: "brand",
					type: "text",
				},
			],
		},
		{
			// Written by the seed in the default locale, English still missing.
			_id: seededId,
			slug: "job-offers",
			name: { fr: "Offres d'emploi" },
			description: { fr: "Emplois à temps plein et à temps partiel" },
			parent: null,
			listingForm: { type: "job", priceLabel: { fr: "Salaire mensuel (XAF)" } },
			attributes: [
				{
					id: rowId(),
					name: { fr: "Type de contrat" },
					slug: "contract-type",
					type: "select",
					options: [
						{ id: rowId(), value: "Full-time", label: { fr: "Temps plein" } },
					],
				},
			],
		},
	];
	return { docs, ids: { vehiclesId, carsId, adminId, editedId, seededId } };
}

const byId = (docs: Doc[], id: ObjectId) =>
	docs.find((doc) => (doc._id as ObjectId).equals(id)) as Doc;
const attribute = (doc: Doc, slug: string) =>
	(doc.attributes as Doc[]).find((row) => row.slug === slug) as Doc;
const option = (attr: Doc, value: string) =>
	(attr.options as Doc[]).find((row) => row.value === value) as Doc;

describe("category label localisation migration", () => {
	it("gives the seed's labels both languages, keyed by the stored ObjectId", async () => {
		const { docs, ids } = fixture();
		const { payload, writes } = rawCategories(docs);

		await localizeCategoryLabels(payload);

		for (const filter of writes) expect(filter._id).toBeInstanceOf(ObjectId);
		const vehicles = byId(docs, ids.vehiclesId);
		expect(vehicles.name).toEqual({ fr: "Véhicules", en: "Vehicles" });
		expect(vehicles.description).toEqual({
			fr: "Voitures, motos, camions et autres véhicules",
			en: "Cars, motorcycles, trucks, and other vehicles",
		});

		const cars = byId(docs, ids.carsId);
		expect(cars._id).toBeInstanceOf(ObjectId);
		expect((cars.parent as ObjectId).equals(ids.vehiclesId)).toBe(true);
		const condition = attribute(cars, "condition");
		expect(condition.name).toEqual({ fr: "État", en: "Condition" });
		expect(option(condition, "new").label).toEqual({ fr: "Neuf", en: "New" });
		const fuel = attribute(cars, "fuel-type");
		expect(fuel.name).toEqual({ fr: "Carburant", en: "Fuel Type" });
		expect(fuel.group).toEqual({
			fr: "Moteur & performances",
			en: "Engine & Performance",
		});
		expect(option(fuel, "Petrol").label).toEqual({
			fr: "Essence",
			en: "Petrol",
		});
		// Same word in both languages: no label invented.
		expect(option(fuel, "Diesel").label).toBeUndefined();
		expect(attribute(cars, "power").unit).toEqual({ fr: "ch", en: "hp" });
	});

	it("keeps an admin's wording exactly, as the French, and lists it", async () => {
		const { docs, ids } = fixture();
		const { payload } = rawCategories(docs);

		const report = await localizeCategoryLabels(payload);

		const custom = byId(docs, ids.adminId);
		expect(custom.name).toEqual({ fr: "Pièces vélo" });
		expect(custom.description).toBe("");
		expect((custom.listingForm as Doc).priceLabel).toEqual({
			fr: "Prix du lot",
		});
		expect((custom.listingForm as Doc).type).toBe("auto");
		expect(attribute(custom, "real-km").name).toEqual({
			fr: "Kilométrage réel",
		});
		const fuel = attribute(byId(docs, ids.carsId), "fuel-type");
		expect(option(fuel, "Black").label).toEqual({ fr: "Noir mat" });

		expect(report.untranslated).toEqual(
			expect.arrayContaining([
				"bikes-parts › name: Pièces vélo",
				"bikes-parts › listingForm.priceLabel: Prix du lot",
				"bikes-parts › real-km.name: Kilométrage réel",
				"cars › fuel-type.options.Black: Noir mat",
			]),
		);
		expect(report.keptAsIs).toBe(report.untranslated.length);
	});

	it("never touches a label already localised, and fills only a missing seed language", async () => {
		const { docs, ids } = fixture();
		const edited = clone(byId(docs, ids.editedId));
		const { payload } = rawCategories(docs);

		await localizeCategoryLabels(payload);

		const after = byId(docs, ids.editedId);
		expect(after.name).toEqual(edited.name);
		expect(after.description).toEqual(edited.description);
		expect(after.attributes).toEqual(edited.attributes);

		const seeded = byId(docs, ids.seededId);
		expect(seeded.name).toEqual({ fr: "Offres d'emploi", en: "Job Offers" });
		expect((seeded.listingForm as Doc).priceLabel).toEqual({
			fr: "Salaire mensuel (XAF)",
			en: "Monthly salary (XAF)",
		});
		const contract = attribute(seeded, "contract-type");
		expect(contract.name).toEqual({
			fr: "Type de contrat",
			en: "Contract Type",
		});
		expect(option(contract, "Full-time").label).toEqual({
			fr: "Temps plein",
			en: "Full-time",
		});
	});

	it("is idempotent: a second run writes nothing", async () => {
		const { docs } = fixture();
		const { payload, writes } = rawCategories(docs);

		await localizeCategoryLabels(payload);
		const once = clone(docs);
		const writesOnce = writes.length;
		const second = await localizeCategoryLabels(payload);

		expect(second.categoriesUpdated).toBe(0);
		expect(writes.length).toBe(writesOnce);
		expect(docs).toEqual(once);
	});
});

describe("labels a Payload write filed under the wrong language", () => {
	const misfiled = () => {
		const id = new ObjectId();
		const docs: Doc[] = [
			{
				_id: id,
				slug: "cars",
				// A default-locale write on a doc still holding the seed's English.
				name: { fr: "Cars" },
				description: { en: "Voitures neuves et d'occasion à vendre" },
				listingForm: { type: "auto", priceLabel: { en: "Tarif maison" } },
				attributes: [
					{
						id: rowId(),
						name: { fr: "Fuel Type" },
						slug: "fuel-type",
						type: "select",
						group: { fr: "Engine & Performance" },
						options: [{ id: rowId(), value: "x", label: { en: "Neuf" } }],
					},
					{
						id: rowId(),
						name: { fr: "hp", en: "hp" },
						slug: "p",
						unit: { fr: "hp" },
					},
					{ id: rowId(), name: { fr: "Brand", en: "Make" }, slug: "brand" },
				],
			},
		];
		return { docs, id };
	};

	it("moves a seed word into the language it is written in and fills the other", async () => {
		const { docs, id } = misfiled();
		const { payload } = rawCategories(docs);

		await localizeCategoryLabels(payload);

		const cars = byId(docs, id);
		expect(cars.name).toEqual({ fr: "Voitures", en: "Cars" });
		expect(cars.description).toEqual({
			fr: "Voitures neuves et d'occasion à vendre",
			en: "Used and new cars for sale",
		});
		const fuel = attribute(cars, "fuel-type");
		expect(fuel.name).toEqual({ fr: "Carburant", en: "Fuel Type" });
		expect(fuel.group).toEqual({
			fr: "Moteur & performances",
			en: "Engine & Performance",
		});
		expect(option(fuel, "x").label).toEqual({ fr: "Neuf", en: "New" });
		expect(attribute(cars, "p").unit).toEqual({ fr: "ch", en: "hp" });
	});

	it("lists English with no French, and English left in the French", async () => {
		const { docs } = misfiled();
		const { payload } = rawCategories(docs);

		const report = await localizeCategoryLabels(payload);

		expect(report.untranslated).toEqual(
			expect.arrayContaining([
				"cars › listingForm.priceLabel (English only, no French): Tarif maison",
				"cars › brand.name (English in the French): Brand",
			]),
		);
	});
});

describe("rolling the localisation back", () => {
	it("turns every label back into the string the previous build showed", async () => {
		const { docs, ids } = fixture();
		const original = clone(docs);
		const { payload, writes } = rawCategories(docs);

		await localizeCategoryLabels(payload);
		const up = writes.length;
		const report = await flattenCategoryLabels(payload);

		for (const filter of writes.slice(up)) {
			expect(filter._id).toBeInstanceOf(ObjectId);
		}
		expect(report.categoriesUpdated).toBe(docs.length);
		const vehicles = byId(docs, ids.vehiclesId);
		expect(vehicles.name).toBe("Vehicles");
		expect(vehicles.description).toBe(
			"Cars, motorcycles, trucks, and other vehicles",
		);
		const cars = byId(docs, ids.carsId);
		expect(cars.name).toBe("Cars");
		expect((cars.parent as ObjectId).equals(ids.vehiclesId)).toBe(true);
		const condition = attribute(cars, "condition");
		expect(condition.name).toBe("État");
		expect(option(condition, "new").label).toBe("Neuf");
		const fuel = attribute(cars, "fuel-type");
		expect(fuel.name).toBe("Fuel Type");
		expect(fuel.group).toBe("Engine & Performance");
		expect(option(fuel, "Petrol").label).toBe("Petrol");
		expect(option(fuel, "Black").label).toBe("Noir mat");
		expect(attribute(cars, "power").unit).toBe("hp");
		// An admin's own wording comes back as written.
		expect(byId(docs, ids.adminId)).toEqual(byId(original, ids.adminId));
		const edited = byId(docs, ids.editedId);
		expect(edited.name).toBe("Motorcycles");
		expect(attribute(edited, "brand").name).toBe("Brand");
		const seeded = byId(docs, ids.seededId);
		expect(seeded.name).toBe("Job Offers");
		expect((seeded.listingForm as Doc).priceLabel).toBe("Monthly salary (XAF)");
	});

	it("is idempotent, and up → down → up lands where up did", async () => {
		const { docs, ids } = fixture();
		const { payload, writes } = rawCategories(docs);

		await localizeCategoryLabels(payload);
		const localised = clone(docs);
		await flattenCategoryLabels(payload);
		const flat = clone(docs);
		const before = writes.length;
		expect((await flattenCategoryLabels(payload)).categoriesUpdated).toBe(0);
		expect(writes.length).toBe(before);
		expect(docs).toEqual(flat);

		await localizeCategoryLabels(payload);
		const others = (rows: Doc[]) =>
			rows.filter((doc) => !(doc._id as ObjectId).equals(ids.editedId));
		expect(others(docs)).toEqual(others(localised));
		// One string cannot hold two admin wordings: the English is what returns.
		expect(byId(docs, ids.editedId).name).toEqual({
			fr: "Motos",
			en: "Motorcycles",
		});
	});
});

describe("category catch-up on a row with no French", () => {
	it("writes the seed's French, or the English, so the required name holds", () => {
		const rows = withFrenchLabels(
			[
				{ id: "a", slug: "fuel-type" },
				{ id: "b", slug: "own", name: "" },
				{ id: "c", slug: "kept", name: "Marque" },
			],
			new Map([
				["a", { id: "a", name: "Fuel Type", group: "Engine & Performance" }],
				["b", { id: "b", name: "Frame size" }],
				["c", { id: "c", name: "Brand" }],
			]),
		);
		expect(rows).toEqual([
			{
				id: "a",
				slug: "fuel-type",
				name: "Carburant",
				group: "Moteur & performances",
			},
			{ id: "b", slug: "own", name: "Frame size" },
			{ id: "c", slug: "kept", name: "Marque" },
		]);
	});
});

describe("category label translations", () => {
	it("covers every label the seed writes", () => {
		const missing: string[] = [];
		const check = (kind: CategoryLabelKind, value: string | undefined) => {
			if (value && !seedLabelTranslation(kind, value)) {
				missing.push(`${kind}: ${value}`);
			}
		};
		for (const category of seededDefinitions) {
			check("name", category.name);
			check("description", category.description);
			check("priceLabel", category.listingForm?.priceLabel ?? undefined);
			for (const attr of category.attributes) {
				check("attribute", attr.name);
				check("group", attr.group);
				for (const opt of attr.options ?? []) {
					if (opt.label) check("option", opt.label);
				}
			}
		}
		expect(missing).toEqual([]);
	});

	it("gives each French string one English, so either can be recovered", () => {
		for (const kind of Object.keys(CATEGORY_LABELS_FR) as CategoryLabelKind[]) {
			const french = [
				...Object.values(CATEGORY_LABELS_FR[kind]),
				...Object.keys(SEEDED_IN_FRENCH[kind]),
			];
			expect(new Set(french).size, kind).toBe(french.length);
			for (const [en, fr] of Object.entries(CATEGORY_LABELS_FR[kind])) {
				expect(seedLabelTranslation(kind, fr)).toEqual({ fr, en });
			}
		}
	});

	it("words a seed attribute in French for the default locale", () => {
		expect(
			frenchSeedAttribute({
				name: "Colour",
				group: "Appearance",
				unit: "hp",
				options: [
					{ value: "Black" },
					{ value: "Beige" },
					{ value: "new", label: "Neuf" },
				],
			}),
		).toEqual({
			name: "Couleur",
			group: "Aspect",
			unit: "ch",
			options: [
				{ value: "Black", label: "Noir" },
				{ value: "Beige" },
				{ value: "new", label: "Neuf" },
			],
		});
	});
});

describe("category label fields", () => {
	type Field = {
		name?: string;
		localized?: boolean;
		fields?: Field[];
	};
	const localizedPaths = (fields: Field[], prefix = ""): string[] =>
		fields.flatMap((field) => {
			const path = field.name ? `${prefix}${field.name}` : prefix.slice(0, -1);
			const own = field.localized ? [path] : [];
			const nested = field.fields
				? localizedPaths(field.fields, field.name ? `${path}.` : prefix)
				: [];
			return [...own, ...nested];
		});

	it("localises exactly the labels people read", () => {
		expect(localizedPaths(Categories.fields as Field[]).sort()).toEqual([
			"attributes.group",
			"attributes.name",
			"attributes.options.label",
			"attributes.unit",
			"description",
			"listingForm.priceLabel",
			"name",
		]);
	});
});
