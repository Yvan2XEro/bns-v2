import { z } from "zod";
import type {
	Category,
	ProductDetailResponse,
	ProductInput,
	ProductSaveResponse,
	VariantDoc,
} from "~/types";
import {
	type FieldIssue,
	issuesFromErrorBody,
} from "../../../api/src/contracts/formIssues";
import {
	PRODUCT_LIMITS,
	productInputIssues,
} from "../../../api/src/contracts/productValidation";
import {
	type CategoryAttributeSpec,
	collectAttributeIssues,
	pruneAttributeValues,
	type ResolvedFormPreset,
	resolveCategoryAttributes,
	resolveFormPreset,
} from "./category-form";
import { generateCombinations } from "./variants";

export type { FieldIssue } from "../../../api/src/contracts/formIssues";
export { PRODUCT_LIMITS };
export const MAX_OPTIONS = PRODUCT_LIMITS.optionsMax;
export const MAX_IMAGES = PRODUCT_LIMITS.imagesMax;
export const TITLE_MIN = PRODUCT_LIMITS.titleMin;
export const TITLE_MAX = PRODUCT_LIMITS.titleMax;
export const DESCRIPTION_MAX = PRODUCT_LIMITS.descriptionMax;

/**
 * "435 000" or "435000" → 435000; empty or invalid → null.
 *
 * Only plain digits are an amount. `Number` would also read "0x1f", "1e6",
 * "+5" and "-5", and every one of those would reach the server as a price
 * nobody typed. `\s` already covers the non-breaking and narrow spaces
 * amounts are printed with.
 */
export function parseAmount(value: string): number | null {
	const cleaned = value.replace(/\s/g, "");
	if (!/^\d+$/.test(cleaned)) return null;
	const parsed = Number(cleaned);
	return Number.isSafeInteger(parsed) ? parsed : null;
}

/** Blank means "not entered yet"; anything else must be a plain amount. Shared with inventory.ts. */
export const optionalAmount = z
	.string()
	.refine((value) => value.trim() === "" || parseAmount(value) !== null);

const optionRowSchema = z.object({
	name: z.string(),
	values: z.array(z.string()),
});

const variantRowSchema = z.object({
	/** Stable identity of the combination, so a row survives an option edit. */
	key: z.string(),
	id: z.string().optional(),
	optionValues: z.record(z.string()),
	sku: z.string(),
	barcode: z.string().optional(),
	price: z.string(),
	cost: z.string(),
	threshold: z.string(),
	initialStock: z.string(),
	stockOnHand: z.number().nullable(),
	trackInventory: z.boolean(),
});

const existingImageSchema = z.object({ id: z.string(), url: z.string() });

/** A picked file with the object URL that previews it until it is uploaded. */
const imageDraftSchema = z.object({
	file: z.custom<File>((value) => value instanceof File),
	preview: z.string(),
});

/** The editor's shape only; the rules live in `productFormIssues`. */
const productFormShape = z.object({
	title: z.string(),
	description: z.string(),
	categoryId: z.string().nullable(),
	attributeValues: z.record(z.string()),
	existingImages: z.array(existingImageSchema),
	newImages: z.array(imageDraftSchema),
	options: z.array(optionRowSchema),
	variants: z.array(variantRowSchema),
	codAllowed: z.boolean(),
	pickupAllowed: z.boolean(),
	handlingHours: z.string(),
	returnPolicy: z.string(),
	warrantyMonths: z.string(),
	status: z.enum(["draft", "active", "archived"]),
});

export type ProductFormState = z.infer<typeof productFormShape>;
export type OptionRow = ProductFormState["options"][number];
export type VariantRow = ProductFormState["variants"][number];
export type ExistingImage = ProductFormState["existingImages"][number];
export type ImageDraft = ProductFormState["newImages"][number];

export interface ProductCategoryContext {
	category: Category | null;
	attributes: CategoryAttributeSpec[];
	preset: ResolvedFormPreset;
}

/** What the chosen category adds to the form: its own fields and its preset. */
export function resolveProductCategory(
	categories: Category[],
	categoryId: string | null,
): ProductCategoryContext {
	const category =
		categories.find((candidate) => candidate.id === categoryId) ?? null;
	return {
		category,
		attributes: resolveCategoryAttributes(category),
		preset: resolveFormPreset(category),
	};
}

/**
 * A row is identified by its values in option order, never by the option
 * names: renaming "Couleur" must not turn "Noir · 256 Go" into a different
 * variant. Keying by name and value — the shape a `name=value` sort produces —
 * is exactly the trap that made a rename archive every live variant.
 */
function rowKey(values: Record<string, string>): string {
	return JSON.stringify(valueTuple(values));
}

/** The values a row or a combination carries, in option order. */
function valueTuple(values: Record<string, string>): string[] {
	return Object.values(values);
}

function sameTuple(a: string[], b: string[]): boolean {
	return a.length === b.length && a.every((value, index) => value === b[index]);
}

/**
 * Whether `short` appears inside `long` in order, gaps allowed. Adding or
 * removing one option leaves the other values in place and in order, so this is
 * what "still the same variant, with one more (or one fewer) option" means —
 * including the empty tuple of a product that has no options at all.
 */
function isSubsequence(short: string[], long: string[]): boolean {
	if (short.length > long.length) return false;
	let next = 0;
	for (const value of long) {
		if (next < short.length && short[next] === value) next++;
	}
	return next === short.length;
}

export function emptyVariant(
	optionValues: Record<string, string> = {},
): VariantRow {
	return {
		key: rowKey(optionValues),
		optionValues,
		sku: "",
		barcode: "",
		price: "",
		cost: "",
		threshold: "",
		initialStock: "",
		stockOnHand: null,
		trackInventory: true,
	};
}

/** `returnPolicy` defaults to the shop's own policy when it has one. */
export function emptyState(
	defaults: { returnPolicy?: string | null } = {},
): ProductFormState {
	return {
		title: "",
		description: "",
		categoryId: null,
		attributeValues: {},
		existingImages: [],
		newImages: [],
		options: [],
		variants: [emptyVariant()],
		codAllowed: true,
		pickupAllowed: false,
		handlingHours: "24",
		returnPolicy: defaults.returnPolicy ?? "",
		warrantyMonths: "",
		status: "active",
	};
}

/**
 * Keeps every row whose combination still exists (and its id, so the server
 * updates rather than recreates it), adds rows for new combinations copying
 * the first row's price and cost, and drops the rest — the server archives a
 * variant that is no longer sent.
 *
 * Matching runs in two passes, and each row is claimed at most once:
 *
 *  1. the identical tuple of values, which covers an option rename and a value
 *     added or removed beside the ones already there;
 *  2. failing that, one tuple contained in the other, which covers an option
 *     added or removed anywhere in the set — the simple product whose single
 *     `{}` row becomes the first combination, the mirror collapse back to it,
 *     and an option inserted or dropped in the middle.
 *
 * Without the second pass, adding the first option to a simple product left
 * the live variant unmatched: the save created a duplicate and abandoned the
 * real one, stock and all.
 */
export function reconcileVariants(
	options: OptionRow[],
	rows: VariantRow[],
): VariantRow[] {
	const combos = generateCombinations(options);
	const tuples = combos.map(valueTuple);
	const unclaimed = [...rows];
	const template = rows[0];

	const claim = (
		matches: (row: string[]) => boolean,
	): VariantRow | undefined => {
		const index = unclaimed.findIndex((row) =>
			matches(valueTuple(row.optionValues)),
		);
		return index === -1 ? undefined : unclaimed.splice(index, 1)[0];
	};

	const claimed = tuples.map((tuple) => claim((row) => sameTuple(row, tuple)));
	tuples.forEach((tuple, index) => {
		claimed[index] ??= claim(
			(row) => isSubsequence(row, tuple) || isSubsequence(tuple, row),
		);
	});

	return combos.map((combo, index) => {
		const existing = claimed[index];
		// The row keeps its id, its price and its stock, and takes the option
		// names the combination now carries — the server matches a variant on
		// its id, but validates the values against the current options.
		if (existing)
			return { ...existing, key: rowKey(combo), optionValues: combo };
		const fresh = emptyVariant(combo);
		if (template) {
			fresh.price = template.price;
			fresh.cost = template.cost;
			fresh.threshold = template.threshold;
		}
		return fresh;
	});
}

type Loose = Record<string, unknown>;

function asId(value: unknown): string | null {
	if (typeof value === "string") return value;
	if (value && typeof value === "object" && "id" in value) {
		return String((value as { id: unknown }).id);
	}
	return null;
}

/** Accepts `images: [{ image }]` or `images: [media]`, populated or not. */
export function readImages(product: Loose): ExistingImage[] {
	const images = Array.isArray(product.images) ? product.images : [];
	const result: ExistingImage[] = [];
	for (const entry of images) {
		const media =
			entry && typeof entry === "object" && "image" in (entry as Loose)
				? (entry as Loose).image
				: entry;
		const id = asId(media);
		const url =
			media && typeof media === "object"
				? (((media as Loose).thumbnailURL as string | undefined) ??
					((media as Loose).url as string | undefined))
				: undefined;
		if (id) result.push({ id, url: url ?? "" });
	}
	return result;
}

/** Accepts `values: string[]` or `values: [{ value }]`. */
export function readOptions(product: Loose): OptionRow[] {
	const options = Array.isArray(product.options) ? product.options : [];
	return options
		.map((option) => {
			const row = option as Loose;
			const values = Array.isArray(row.values)
				? row.values
						.map((value) =>
							typeof value === "string"
								? value
								: String((value as Loose)?.value ?? ""),
						)
						.filter(Boolean)
				: [];
			return { name: String(row.name ?? ""), values };
		})
		.filter((option) => option.name && option.values.length > 0);
}

function stringifyAttributes(value: unknown): Record<string, string> {
	if (!value || typeof value !== "object" || Array.isArray(value)) return {};
	const result: Record<string, string> = {};
	for (const [key, raw] of Object.entries(value as Loose)) {
		if (raw === null || raw === undefined) continue;
		result[key] = String(raw);
	}
	return result;
}

function rowFromVariant(variant: VariantDoc): VariantRow {
	return {
		key: rowKey(variant.optionValues ?? {}),
		id: variant.id,
		optionValues: variant.optionValues ?? {},
		sku: variant.sku ?? "",
		barcode: variant.barcode ?? "",
		price: String(variant.price ?? ""),
		cost:
			variant.cost === null || variant.cost === undefined
				? ""
				: String(variant.cost),
		threshold:
			variant.lowStockThreshold == null
				? ""
				: String(variant.lowStockThreshold),
		initialStock: "",
		stockOnHand: variant.stockOnHand,
		trackInventory: variant.trackInventory,
	};
}

function liveRows(variants: VariantDoc[]): VariantRow[] {
	const rows = variants
		.filter((variant) => !variant.archivedAt)
		.map(rowFromVariant);
	return rows.length > 0 ? rows : [emptyVariant()];
}

/** The form as the server describes the product, images included. */
function stateFromProduct(
	product: Loose,
	variants: VariantDoc[],
): ProductFormState {
	const delivery = (product.delivery ?? {}) as Loose;
	return {
		title: String(product.title ?? ""),
		description: String(product.description ?? ""),
		categoryId: asId(product.category),
		attributeValues: stringifyAttributes(product.attributes),
		existingImages: readImages(product),
		newImages: [],
		options: readOptions(product),
		variants: liveRows(variants),
		codAllowed: delivery.codAllowed !== false,
		pickupAllowed: delivery.pickupAllowed === true,
		handlingHours:
			typeof delivery.handlingHours === "number"
				? String(delivery.handlingHours)
				: "",
		returnPolicy: String(product.returnPolicy ?? ""),
		warrantyMonths:
			typeof product.warrantyMonths === "number" && product.warrantyMonths > 0
				? String(product.warrantyMonths)
				: "",
		status: (product.status as ProductFormState["status"]) ?? "draft",
	};
}

export function stateFromDetail(
	detail: ProductDetailResponse,
): ProductFormState {
	return stateFromProduct(detail.product as unknown as Loose, detail.variants);
}

/**
 * The form as it should read once the server has answered.
 *
 * Everything is taken from the save: the seller must see what was stored, not
 * what they typed — the server trims, drops empty values and renumbers the
 * variants. Only the picture URLs are local knowledge, because a save answers
 * with image ids and not with media.
 */
export function stateAfterSave(
	submitted: ProductFormState,
	response: ProductSaveResponse,
	uploadedIds: string[],
): ProductFormState {
	const product = response.product as unknown as Loose;
	const saved = stateFromProduct(product, response.variants);

	const known = new Map<string, string>();
	const remember = (id: string, url: string) => {
		if (url && !known.get(id)) known.set(id, url);
	};
	for (const image of saved.existingImages) remember(image.id, image.url);
	for (const image of submitted.existingImages) remember(image.id, image.url);
	uploadedIds.forEach((id, index) => {
		remember(id, submitted.newImages[index]?.preview ?? "");
	});

	const order =
		saved.existingImages.length > 0
			? saved.existingImages.map((image) => image.id)
			: [...submitted.existingImages.map((image) => image.id), ...uploadedIds];

	return {
		...saved,
		existingImages: order.map((id) => ({ id, url: known.get(id) ?? "" })),
		// A product with no option has no `options` on the document, so an empty
		// answer is the truth; only a shape we could not read falls back.
		options:
			saved.options.length > 0 || usableOptions(submitted).length === 0
				? saved.options
				: usableOptions(submitted),
	};
}

function usableOptions(state: ProductFormState): OptionRow[] {
	return state.options.filter(
		(option) => option.name.trim() && option.values.length > 0,
	);
}

export function toProductInput(
	state: ProductFormState,
	imageIds: string[],
	attributes: Record<string, unknown>,
	includeCost: boolean,
): ProductInput {
	const options = usableOptions(state);
	return {
		title: state.title.trim(),
		description: state.description.trim() || null,
		category: state.categoryId ?? "",
		attributes,
		images: imageIds,
		status: state.status,
		options: options.map((option) => ({
			name: option.name.trim(),
			values: option.values,
		})),
		variants: state.variants.map((row) => {
			const initialStock = parseAmount(row.initialStock);
			return {
				...(row.id ? { id: row.id } : {}),
				optionValues: row.optionValues,
				sku: row.sku.trim() || null,
				barcode: (row.barcode ?? "").replace(/\s/g, "") || null,
				price: parseAmount(row.price) ?? 0,
				...(includeCost ? { cost: parseAmount(row.cost) } : {}),
				trackInventory: row.trackInventory,
				lowStockThreshold: parseAmount(row.threshold),
				// Stock is never written directly: an initial quantity is only
				// accepted for a variant the server is about to create, and it
				// reaches the ledger as a receipt.
				...(!row.id && initialStock ? { initialStock } : {}),
			};
		}),
		delivery: {
			codAllowed: state.codAllowed,
			pickupAllowed: state.pickupAllowed,
			handlingHours: parseAmount(state.handlingHours),
		},
		returnPolicy: state.returnPolicy.trim() || null,
		warrantyMonths: parseAmount(state.warrantyMonths) || null,
	};
}

export interface ProductIssueContext {
	attributes: CategoryAttributeSpec[];
	preset: ResolvedFormPreset;
	includeCost: boolean;
}

/** State indexes of the option rows `toProductInput` sends, in body order. */
function sentOptionRows(state: ProductFormState): number[] {
	return state.options.flatMap((option, index) =>
		option.name.trim() && option.values.length > 0 ? [index] : [],
	);
}

const FORM_FIELDS = new Set([
	"title",
	"description",
	"status",
	"returnPolicy",
	"warrantyMonths",
]);

/** Where a request-body path is shown in the editor; `root.server` when nowhere. */
export function productFormPath(path: string, optionRows: number[]): string {
	const [head, index, field] = path.split(".");
	switch (head) {
		case "category":
			return "categoryId";
		case "images":
			return "newImages";
		case "attributes":
			return index ? `attributeValues.${index}` : "attributeValues";
		case "delivery":
			return index === "handlingHours" ? "handlingHours" : "root.server";
		case "options": {
			if (index === undefined) return "options";
			const row = optionRows[Number(index)] ?? Number(index);
			return `options.${row}.${field === "values" ? "values" : "name"}`;
		}
		case "variants":
			if (index === undefined || !field || field === "optionValues")
				return "variants";
			return `variants.${index}.${field === "lowStockThreshold" ? "threshold" : field}`;
		default:
			return FORM_FIELDS.has(head) ? head : "root.server";
	}
}

/**
 * Everything the API would refuse in the body this state saves to, by the
 * API's own rules (`productInputIssues`), on the editor's field paths. Also
 * catches what the body cannot carry: an amount that is not a number (it
 * would be sent as nothing), a blank price (sent as 0), a typed attribute
 * that cannot be converted, and an option
 * row switched on but left without a name or values.
 */
export function productFormIssues(
	state: ProductFormState,
	context: ProductIssueContext,
): FieldIssue[] {
	const issues: FieldIssue[] = [];

	for (const issue of collectAttributeIssues(
		context.attributes,
		state.attributeValues,
	)) {
		const path = `attributeValues.${issue.slug}`;
		if (issue.kind === "required") issues.push({ path, rule: "required" });
		else if (issue.kind === "notANumber") issues.push({ path, rule: "number" });
		else
			issues.push({
				path,
				rule: issue.kind,
				params: { [issue.kind]: issue.limit },
			});
	}
	state.options.forEach((option, index) => {
		if (!option.name.trim())
			issues.push({ path: `options.${index}.name`, rule: "required" });
		if (option.values.length === 0)
			issues.push({
				path: `options.${index}.values`,
				rule: "count",
				params: { min: 1, max: PRODUCT_LIMITS.optionValuesMax },
			});
	});
	const amount = (path: string, value: string, required: boolean) => {
		if (value.trim() === "") {
			if (required) issues.push({ path, rule: "required" });
		} else if (parseAmount(value) === null) {
			issues.push({ path, rule: "wholeNumber" });
		}
	};
	state.variants.forEach((row, index) => {
		amount(`variants.${index}.price`, row.price, true);
		if (context.includeCost) amount(`variants.${index}.cost`, row.cost, false);
		amount(`variants.${index}.threshold`, row.threshold, false);
		if (!row.id)
			amount(`variants.${index}.initialStock`, row.initialStock, false);
	});
	amount("handlingHours", state.handlingHours, false);
	amount("warrantyMonths", state.warrantyMonths, false);

	const body = toProductInput(
		state,
		[
			...state.existingImages.map((image) => image.id),
			...state.newImages.map((_, index) => `new:${index}`),
		],
		pruneAttributeValues(context.attributes, state.attributeValues),
		context.includeCost,
	);
	const optionRows = sentOptionRows(state);
	for (const issue of productInputIssues(
		{
			...body,
			variants: body.variants.map((variant, index) => ({
				...variant,
				price: parseAmount(state.variants[index]?.price ?? ""),
			})),
		},
		{ attributes: context.attributes },
	)) {
		issues.push({ ...issue, path: productFormPath(issue.path, optionRows) });
	}

	const seen = new Set<string>();
	return issues.filter((issue) => {
		if (seen.has(issue.path)) return false;
		seen.add(issue.path);
		return true;
	});
}

/** The field issues of a refused save, on the editor's paths. */
export function serverProductIssues(
	error: unknown,
	submitted: ProductFormState,
): FieldIssue[] {
	if (typeof error !== "object" || error === null) return [];
	const { details, code } = error as { details?: unknown; code?: unknown };
	let issues = issuesFromErrorBody({ details });
	if (issues.length === 0 && code === "listing.categoryNotFound") {
		issues = [{ path: "category", rule: "notFound" }];
	}
	const optionRows = sentOptionRows(submitted);
	return issues.map((issue) => ({
		...issue,
		path: productFormPath(issue.path, optionRows),
	}));
}

const ISSUE_PREFIX = "issue:";

/** An issue travels through react-hook-form as an error message. */
export function encodeIssue(issue: Pick<FieldIssue, "rule" | "params">) {
	return `${ISSUE_PREFIX}${JSON.stringify({ rule: issue.rule, params: issue.params })}`;
}

export function decodeIssue(
	message: unknown,
): Pick<FieldIssue, "rule" | "params"> | null {
	if (typeof message !== "string" || !message.startsWith(ISSUE_PREFIX))
		return null;
	try {
		const parsed = JSON.parse(message.slice(ISSUE_PREFIX.length));
		return typeof parsed?.rule === "string" ? parsed : null;
	} catch {
		return null;
	}
}

/** The issue react-hook-form holds at `path`, an array's own error included. */
export function issueInErrors(
	errors: unknown,
	path: string,
): FieldIssue | null {
	let node: unknown = errors;
	for (const part of path.split(".")) {
		if (typeof node !== "object" || node === null) return null;
		node = (node as Record<string, unknown>)[part];
	}
	if (typeof node !== "object" || node === null) return null;
	const record = node as { message?: unknown; root?: { message?: unknown } };
	const decoded = decodeIssue(record.message ?? record.root?.message);
	return decoded ? { path, ...decoded } : null;
}

export function productFormSchemaFor(context: ProductIssueContext) {
	return productFormShape.superRefine((state, ctx) => {
		for (const issue of productFormIssues(state, context)) {
			if (issue.path.startsWith("root")) continue;
			ctx.addIssue({
				code: z.ZodIssueCode.custom,
				path: issue.path
					.split(".")
					.map((part) => (/^\d+$/.test(part) ? Number(part) : part)),
				message: encodeIssue(issue),
			});
		}
	});
}

/** Rules worded for the field they sit on, then the generic wording. */
const FIELD_RULE_KEYS: Record<string, string> = {
	"variants:count": "variantsCount",
	"variants:single": "variantsSingle",
	"variants:mismatch": "mismatch",
	"options:maxItems": "optionsMax",
	"values:count": "valuesCount",
	"newImages:maxItems": "imagesMax",
};
const RULE_KEYS = new Set([
	"required",
	"length",
	"maxLength",
	"text",
	"option",
	"maxItems",
	"count",
	"duplicate",
	"taken",
	"barcode",
	"mismatch",
	"wholeNumber",
	"number",
	"min",
	"max",
	"boolean",
	"date",
	"notFound",
]);

/** The `ProductIssues` message key for an issue; unknown rules read as "invalid". */
export function productIssueKey(issue: FieldIssue): string {
	const field = issue.path
		.split(".")
		.filter((part) => !/^\d+$/.test(part))
		.pop();
	return (
		FIELD_RULE_KEYS[`${field}:${issue.rule}`] ??
		(RULE_KEYS.has(issue.rule) ? issue.rule : "invalid")
	);
}
