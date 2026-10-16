import { describe, expect, test } from "bun:test";
import { zodResolver } from "@hookform/resolvers/zod";
import { createFormControl } from "react-hook-form";
import { ApiError } from "./apiError";
import { DEFAULT_FORM_PRESET } from "./category-form";
import {
	emptyState,
	emptyVariant,
	encodeIssue,
	issueInErrors,
	type ProductFormState,
	type ProductIssueContext,
	productFormIssues,
	productFormPath,
	productFormSchemaFor,
	productIssueKey,
	serverProductIssues,
} from "./product-form";

const context: ProductIssueContext = {
	attributes: [],
	preset: DEFAULT_FORM_PRESET,
	includeCost: true,
};

function valid(over: Partial<ProductFormState> = {}): ProductFormState {
	return {
		...emptyState(),
		title: "Chaise en bois",
		categoryId: "cat-1",
		variants: [{ ...emptyVariant(), price: "15000" }],
		...over,
	};
}

const paths = (state: ProductFormState, ctx = context) =>
	productFormIssues(state, ctx).map((issue) => [issue.path, issue.rule]);

describe("productFormIssues: the API's rules on the editor's paths", () => {
	test("a complete product has nothing to refuse", () => {
		expect(productFormIssues(valid(), context)).toEqual([]);
	});

	test("a barcode is checked by the shared rule, spaces aside", () => {
		expect(
			paths(
				valid({
					variants: [
						{ ...emptyVariant(), price: "1", barcode: "4006381 333931" },
					],
				}),
			),
		).toEqual([]);
		const wrong = valid({
			variants: [{ ...emptyVariant(), price: "1", barcode: "4006381333932" }],
		});
		expect(paths(wrong)).toEqual([["variants.0.barcode", "barcode"]]);
		expect(
			productIssueKey({ path: "variants.0.barcode", rule: "barcode" }),
		).toBe("barcode");
	});

	test("required and typed category attributes", () => {
		const ctx: ProductIssueContext = {
			...context,
			attributes: [
				{
					slug: "brand",
					name: "Marque",
					type: "text",
					required: true,
					options: [],
				},
				{
					slug: "km",
					name: "Km",
					type: "number",
					required: false,
					options: [],
					max: 10,
				},
				{
					slug: "fuel",
					name: "Carburant",
					type: "select",
					required: false,
					options: [{ value: "diesel", label: "Diesel" }],
				},
			],
		};
		expect(
			paths(valid({ attributeValues: { km: "12", fuel: "electric" } }), ctx),
		).toEqual([
			["attributeValues.brand", "required"],
			["attributeValues.km", "max"],
			["attributeValues.fuel", "option"],
		]);
	});

	test("condition is a category attribute like any other", () => {
		const attributes = [
			{
				name: "État",
				slug: "condition",
				type: "select" as const,
				required: true,
				options: [{ value: "new", label: "Neuf" }],
			},
		];
		expect(paths(valid(), { ...context, attributes })).toEqual([
			["attributeValues.condition", "required"],
		]);
	});

	test("option and variant limits", () => {
		const long = "x".repeat(31);
		const values = Array.from({ length: 21 }, (_, i) => `v${i}`);
		expect(
			paths(
				valid({
					options: [
						{ name: long, values: ["a"] },
						{ name: "Taille", values },
						{ name: "", values: [] },
					],
				}),
			),
		).toEqual([
			["options.2.name", "required"],
			["options.2.values", "count"],
			["options.0.name", "maxLength"],
			["options.1.values", "count"],
		]);
	});

	test("more than 100 variants", () => {
		const variants = Array.from({ length: 101 }, (_, i) => ({
			...emptyVariant({ Taille: `t${i}` }),
			price: "100",
		}));
		const issues = paths(
			valid({
				options: [{ name: "Taille", values: variants.map((_, i) => `t${i}`) }],
				variants,
			}),
		);
		expect(issues).toContainEqual(["variants", "count"]);
	});

	test("SKU length and a SKU repeated in the form", () => {
		const variants = [
			{ ...emptyVariant({ C: "a" }), price: "1", sku: "SKU-1" },
			{ ...emptyVariant({ C: "b" }), price: "1", sku: "SKU-1" },
			{ ...emptyVariant({ C: "c" }), price: "1", sku: "x".repeat(61) },
		];
		expect(
			paths(
				valid({ options: [{ name: "C", values: ["a", "b", "c"] }], variants }),
			),
		).toEqual([
			["variants.1.sku", "duplicate"],
			["variants.2.sku", "maxLength"],
		]);
	});

	test("blank and malformed amounts", () => {
		expect(
			paths(
				valid({
					variants: [{ ...emptyVariant(), price: "", threshold: "1,5" }],
					warrantyMonths: "abc",
				}),
			),
		).toEqual([
			["variants.0.price", "required"],
			["variants.0.threshold", "wholeNumber"],
			["warrantyMonths", "wholeNumber"],
		]);
	});

	test("handlingHours, warrantyMonths and returnPolicy caps", () => {
		expect(
			paths(
				valid({
					handlingHours: "721",
					warrantyMonths: "61",
					returnPolicy: "r".repeat(2001),
				}),
			),
		).toEqual([
			["handlingHours", "max"],
			["returnPolicy", "maxLength"],
			["warrantyMonths", "max"],
		]);
	});
});

describe("server refusals land on the field", () => {
	test("body paths map to the editor's", () => {
		expect(productFormPath("category", [])).toBe("categoryId");
		expect(productFormPath("attributes.brand", [])).toBe(
			"attributeValues.brand",
		);
		expect(productFormPath("delivery.handlingHours", [])).toBe("handlingHours");
		expect(productFormPath("variants.3.lowStockThreshold", [])).toBe(
			"variants.3.threshold",
		);
		expect(productFormPath("variants.0.optionValues", [])).toBe("variants");
		// The body drops an unusable option row, so its indexes shift.
		expect(productFormPath("options.0.values", [1])).toBe("options.1.values");
		expect(productFormPath("shop", [])).toBe("root.server");
	});

	test("a taken SKU (409) is read from details.issues", () => {
		const error = new ApiError("x", 409, "products.skuTaken", {
			issues: [{ path: "variants.0.sku", rule: "taken" }],
		});
		const issues = serverProductIssues(error, valid());
		expect(issues).toEqual([{ path: "variants.0.sku", rule: "taken" }]);
		expect(productIssueKey(issues[0]!)).toBe("taken");
	});
});

function form(state: ProductFormState) {
	return createFormControl<ProductFormState>({
		defaultValues: state,
		resolver: zodResolver(productFormSchemaFor(context)),
	});
}

describe("submit is blocked before the server sees the value", () => {
	test("a SKU the server would refuse stops handleSubmit and sits on its field", async () => {
		const { control, handleSubmit } = form(
			valid({
				options: [{ name: "C", values: ["a", "b"] }],
				variants: [
					{ ...emptyVariant({ C: "a" }), price: "1", sku: "DUP" },
					{ ...emptyVariant({ C: "b" }), price: "1", sku: "DUP" },
				],
			}),
		);
		let sent = false;
		await handleSubmit(() => {
			sent = true;
		})();
		expect(sent).toBe(false);
		expect(issueInErrors(control._formState.errors, "variants.1.sku")).toEqual({
			path: "variants.1.sku",
			rule: "duplicate",
		});
	});

	test("a handlingHours above 720 stops handleSubmit", async () => {
		const { control, handleSubmit } = form(valid({ handlingHours: "1000" }));
		let sent = false;
		await handleSubmit(() => {
			sent = true;
		})();
		expect(sent).toBe(false);
		expect(
			issueInErrors(control._formState.errors, "handlingHours")?.rule,
		).toBe("max");
	});

	test("a valid product goes through", async () => {
		const { handleSubmit } = form(valid());
		let sent = false;
		await handleSubmit(() => {
			sent = true;
		})();
		expect(sent).toBe(true);
	});

	test("a server issue set on a field reads back from the errors", () => {
		const { control, setError } = form(valid());
		setError("variants.0.sku", {
			type: "taken",
			message: encodeIssue({ rule: "taken" }),
		});
		expect(
			issueInErrors(control._formState.errors, "variants.0.sku")?.rule,
		).toBe("taken");
	});
});

describe("a new product's return policy", () => {
	test("starts from the shop's default, else blank", () => {
		expect(emptyState().returnPolicy).toBe("");
		expect(emptyState({ returnPolicy: null }).returnPolicy).toBe("");
		expect(
			emptyState({ returnPolicy: "Retour sous 7 jours" }).returnPolicy,
		).toBe("Retour sous 7 jours");
	});
});
