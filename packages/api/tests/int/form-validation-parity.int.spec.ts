// @vitest-environment node
import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";

const { validateListingAttributesMock } = vi.hoisted(() => ({
	validateListingAttributesMock: vi.fn(
		async (): Promise<{ field: string; message: string }[]> => [],
	),
}));
vi.mock("../../src/hooks/validation", () => ({
	validateListingAttributes: validateListingAttributesMock,
}));

import {
	emptyProductForm,
	productFormIssues,
	syncVariantRows,
} from "../../../mobile/src/lib/productForm";
import { Listings } from "../../src/collections/Listings";
import { attributeValueIssues } from "../../src/contracts/categoryAttributes";
import { issuesFromErrorBody } from "../../src/contracts/formIssues";
import {
	listingInputIssues,
	listingIssueStep,
} from "../../src/contracts/listingValidation";
import {
	productInputIssues,
	productIssueStep,
} from "../../src/contracts/productValidation";
import { ServiceError } from "../../src/lib/serviceError";
import { parseProductInput } from "../../src/services/products";
import { fakePayload } from "./helpers/fakePayload";

/**
 * The product rules live once, in `contracts/productValidation.ts`. The
 * service refuses with exactly what `productInputIssues` reports, and the
 * clients import the same function — so a form that lets a step through can
 * no longer be refused at submit for a rule it could have known.
 */
const valid = {
	title: "Samsung Galaxy S24",
	category: "cat-1",
	status: "active",
	options: [],
	variants: [{ optionValues: {}, price: 1000 }],
};
const withColour = {
	...valid,
	options: [{ name: "Couleur", values: ["Noir", "Blanc"] }],
	variants: [
		{ optionValues: { Couleur: "Noir" }, price: 1000 },
		{ optionValues: { Couleur: "Blanc" }, price: 1000 },
	],
};

const CASES: Array<{ name: string; body: Record<string, unknown> }> = [
	{ name: "a complete simple product", body: valid },
	{ name: "a complete product with options", body: withColour },
	{ name: "a 2-character title", body: { ...valid, title: "ab" } },
	{ name: "a 121-character title", body: { ...valid, title: "x".repeat(121) } },
	{ name: "a numeric title", body: { ...valid, title: 42 } },
	{ name: "no category", body: { ...valid, category: "" } },
	{ name: "an unknown condition", body: { ...valid, condition: "mint" } },
	{
		name: "11 photos",
		body: { ...valid, images: Array.from({ length: 11 }, (_, i) => `m${i}`) },
	},
	{
		name: "a 5001-character description",
		body: { ...valid, description: "x".repeat(5001) },
	},
	{ name: "an unknown status", body: { ...valid, status: "live" } },
	{
		name: "four options",
		body: {
			...valid,
			options: ["a", "b", "c", "d"].map((name) => ({ name, values: ["1"] })),
		},
	},
	{
		name: "an option without values",
		body: { ...valid, options: [{ name: "Couleur", values: [] }] },
	},
	{
		name: "an option value of 31 characters",
		body: {
			...withColour,
			options: [{ name: "Couleur", values: ["Noir", "x".repeat(31)] }],
		},
	},
	{
		name: "two options with the same name",
		body: {
			...valid,
			options: [
				{ name: "Couleur", values: ["Noir"] },
				{ name: "couleur", values: ["Blanc"] },
			],
		},
	},
	{
		name: "a variant priced blank",
		body: { ...valid, variants: [{ optionValues: {}, price: "" }] },
	},
	{
		name: "a variant priced 12.5",
		body: { ...valid, variants: [{ optionValues: {}, price: 12.5 }] },
	},
	{
		name: "a negative cost",
		body: { ...valid, variants: [{ optionValues: {}, price: 1, cost: -1 }] },
	},
	{
		name: "a 61-character SKU",
		body: {
			...valid,
			variants: [{ optionValues: {}, price: 1, sku: "x".repeat(61) }],
		},
	},
	{
		name: "two variants sharing a SKU",
		body: {
			...withColour,
			variants: withColour.variants.map((v) => ({ ...v, sku: "S24" })),
		},
	},
	{
		name: "a variant using a value its option does not have",
		body: {
			...withColour,
			variants: [{ optionValues: { Couleur: "Rouge" }, price: 1 }],
		},
	},
	{
		name: "two variants with the same options",
		body: {
			...withColour,
			variants: [withColour.variants[0], withColour.variants[0]],
		},
	},
	{
		name: "two variants without options",
		body: { ...valid, variants: [valid.variants[0], valid.variants[0]] },
	},
	{ name: "no variant", body: { ...valid, variants: [] } },
	{
		name: "a preparation time of 721 hours",
		body: { ...valid, delivery: { handlingHours: 721 } },
	},
	{
		name: "a 2001-character return policy",
		body: { ...valid, returnPolicy: "x".repeat(2001) },
	},
	{ name: "a 61-month warranty", body: { ...valid, warrantyMonths: 61 } },
];

describe("product rules: the service refuses exactly what the shared rules report", () => {
	for (const { name, body } of CASES) {
		it(name, () => {
			const issues = productInputIssues(body);
			let refusal: unknown = null;
			try {
				parseProductInput(body);
			} catch (error) {
				refusal = error;
			}
			if (issues.length === 0) {
				expect(refusal).toBeNull();
				return;
			}
			expect(refusal).toBeInstanceOf(ServiceError);
			expect(refusal).toMatchObject({
				code: "generic.validation",
				status: 400,
				details: { issues },
			});
		});
	}

	it("every refusal names a field the wizard can send the seller back to", () => {
		for (const { body } of CASES) {
			for (const issue of productInputIssues(body)) {
				expect(issue.path).not.toBe("");
				expect(["info", "variants", "publish"]).toContain(
					productIssueStep(issue.path),
				);
			}
		}
	});
});

describe("product rules: the mobile wizard runs the same rules", () => {
	it("flags what the server would refuse, on the server's paths", () => {
		const form = emptyProductForm();
		form.title = "Samsung";
		form.category = { id: "cat-1", name: "Phones", slug: "phones" };
		form.hasVariants = true;
		form.options = [{ name: "Couleur", values: ["Noir", "Blanc"] }];
		form.variants = syncVariantRows(form).map((row) => ({
			...row,
			price: "1000",
			sku: "S24",
		}));
		form.handlingHours = "900";
		const paths = productFormIssues(form, []).map((issue) => issue.path);
		expect(paths).toEqual(["variants.1.sku", "delivery.handlingHours"]);
	});
});

describe("one rule module, every caller", () => {
	const read = (path: string) =>
		readFileSync(new URL(path, import.meta.url), "utf8");

	it.each([
		[
			"the product service",
			"../../src/services/products.ts",
			"productValidation",
		],
		[
			"the listings hook",
			"../../src/collections/Listings.ts",
			"listingValidation",
		],
		[
			"the attribute check",
			"../../src/hooks/validation.ts",
			"categoryAttributes",
		],
		[
			"the mobile product wizard",
			"../../../mobile/src/lib/productForm.ts",
			"productValidation",
		],
		[
			"the mobile listing forms",
			"../../../mobile/src/lib/listingForm.ts",
			"listingValidation",
		],
		[
			"the web listing creation",
			"../../../web/src/lib/listing-issues.ts",
			"listingValidation",
		],
		[
			"the web seller product editor",
			"../../../web/src/lib/product-form.ts",
			"productValidation",
		],
	])("%s imports contracts/%s", (_, file, module) => {
		expect(read(file)).toMatch(new RegExp(`contracts/${module}"`));
	});
});

describe("attribute rules", () => {
	const defs = [
		{ slug: "brand", name: "Marque", type: "text", required: true },
		{ slug: "km", name: "Kilométrage", type: "number", min: 0, max: 500000 },
		{
			slug: "fuel",
			name: "Carburant",
			type: "select",
			options: [{ value: "diesel" }, "petrol"],
		},
		{ slug: "ac", name: "Clim", type: "boolean" },
	];

	it("reports each refusal on attributes.<slug>", () => {
		expect(
			attributeValueIssues(defs, {
				km: "12",
				fuel: "electric",
				ac: "true",
			}).map((issue) => [issue.path, issue.rule]),
		).toEqual([
			["attributes.brand", "required"],
			["attributes.km", "number"],
			["attributes.fuel", "option"],
			["attributes.ac", "boolean"],
		]);
	});

	it("enforces bounds only once they are set", () => {
		expect(attributeValueIssues(defs, { brand: "x", km: 600000 })).toEqual([
			expect.objectContaining({ path: "attributes.km", rule: "max" }),
		]);
		expect(
			attributeValueIssues([{ slug: "n", type: "number" }], { n: -5 }),
		).toEqual([]);
	});
});

describe("classified listing rules", () => {
	const product = {
		price: { enabled: true, required: true },
		condition: { enabled: true, required: false },
		photos: { enabled: true, required: true },
	};
	const body = {
		title: "iPhone",
		description: "desc",
		category: "cat-1",
		location: "Douala",
		price: 1000,
		images: [{ image: "m1" }],
	};

	it("accepts a complete listing", () => {
		expect(listingInputIssues(body, { preset: product })).toEqual([]);
	});

	it("names each missing field and the step that shows it", () => {
		const issues = listingInputIssues(
			{ ...body, title: " ", location: "", price: undefined, images: [] },
			{ preset: product },
		);
		expect(
			issues.map((issue) => [issue.path, listingIssueStep(issue.path)]),
		).toEqual([
			["title", "describe"],
			["location", "details"],
			["price", "details"],
			["images", "photos"],
		]);
	});

	it("refuses a fourth image only when the listing grows past three", () => {
		const four = Array.from({ length: 4 }, (_, i) => ({ image: `m${i}` }));
		expect(
			listingInputIssues({ ...body, images: four }, { preset: product }),
		).toEqual([{ path: "images", rule: "maxItems", params: { max: 3 } }]);
		expect(
			listingInputIssues(
				{ ...body, images: four },
				{ preset: product, previousImageCount: 5 },
			),
		).toEqual([]);
	});
});

describe("the listings hook answers with the field it refuses", () => {
	const beforeChange = Listings.hooks?.beforeChange?.[0] as (
		args: unknown,
	) => Promise<Record<string, unknown>>;
	const payload = fakePayload({
		categories: [
			{ id: "cat-1", slug: "phones", listingForm: { type: "product" } },
		],
	});
	const create = (data: Record<string, unknown>) =>
		beforeChange({
			operation: "create",
			data: {
				title: "iPhone",
				description: "desc",
				category: "cat-1",
				location: "Douala",
				images: [],
				...data,
			},
			req: { payload, user: { id: "u-1" }, context: {} },
		});

	it("a missing price is a ValidationError on `price`", async () => {
		await expect(create({ price: null })).rejects.toMatchObject({
			status: 400,
			data: { errors: [{ path: "price" }] },
		});
	});

	it("an unknown condition is a ValidationError on `condition`", async () => {
		await expect(
			create({ price: 10, condition: "mint" }),
		).rejects.toMatchObject({ data: { errors: [{ path: "condition" }] } });
	});

	it("attribute refusals are ValidationErrors on `attributes.<slug>`", async () => {
		validateListingAttributesMock.mockResolvedValueOnce([
			{ field: "brand", message: "Marque is required" },
		]);
		await expect(create({ price: 10 })).rejects.toMatchObject({
			data: {
				errors: [{ path: "attributes.brand", message: "Marque is required" }],
			},
		});
	});

	it("both clients read those paths back out of the response body", () => {
		expect(
			issuesFromErrorBody({
				errors: [
					{
						name: "ValidationError",
						data: { errors: [{ path: "price", message: "x" }] },
					},
				],
			}),
		).toEqual([{ path: "price", rule: "invalid" }]);
		expect(
			issuesFromErrorBody({
				code: "generic.validation",
				details: { issues: [{ path: "variants.0.sku", rule: "taken" }] },
			}),
		).toEqual([{ path: "variants.0.sku", rule: "taken" }]);
	});
});
