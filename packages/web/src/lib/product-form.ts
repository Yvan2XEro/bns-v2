import { z } from "zod";
import type {
	Category,
	ProductDetailResponse,
	ProductInput,
	ProductSaveResponse,
	VariantDoc,
} from "~/types";
import {
	type CategoryAttributeSpec,
	type ResolvedFormPreset,
	resolveCategoryAttributes,
	resolveFormPreset,
} from "./category-form";
import { generateCombinations } from "./variants";

export const MAX_OPTIONS = 3;
export const MAX_IMAGES = 10;
export const TITLE_MIN = 3;
export const TITLE_MAX = 120;
export const DESCRIPTION_MAX = 5000;

/**
 * "435 000" or "435000" → 435000; empty or invalid → null.
 *
 * Only plain digits are an amount. `Number` would also read "0x1f", "1e6",
 * "+5" and "-5", and every one of those would reach the server as a price
 * nobody typed. `\s` already covers the non-breaking and narrow spaces XAF
 * amounts are printed with.
 */
export function parseAmount(value: string): number | null {
	const cleaned = value.replace(/\s/g, "");
	if (!/^\d+$/.test(cleaned)) return null;
	const parsed = Number(cleaned);
	return Number.isSafeInteger(parsed) ? parsed : null;
}

const requiredAmount = z
	.string()
	.refine((value) => parseAmount(value) !== null);
const optionalAmount = z
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
	price: requiredAmount,
	cost: optionalAmount,
	threshold: optionalAmount,
	initialStock: optionalAmount,
	stockOnHand: z.number().nullable(),
	trackInventory: z.boolean(),
});

const existingImageSchema = z.object({ id: z.string(), url: z.string() });

/** A picked file with the object URL that previews it until it is uploaded. */
const imageDraftSchema = z.object({
	file: z.custom<File>((value) => value instanceof File),
	preview: z.string(),
});

/**
 * The product editor, in one schema. It mirrors what `parseProductInput`
 * accepts on the API side; the server stays the authority on option/variant
 * consistency and on the stock ledger, so nothing here tries to predict those.
 */
export const productFormSchema = z
	.object({
		title: z.string().refine((value) => {
			const trimmed = value.trim();
			return trimmed.length >= TITLE_MIN && trimmed.length <= TITLE_MAX;
		}),
		description: z.string().max(DESCRIPTION_MAX),
		categoryId: z
			.string()
			.nullable()
			.refine((value) => value !== null && value.length > 0),
		condition: z.string(),
		attributeValues: z.record(z.string()),
		existingImages: z.array(existingImageSchema),
		newImages: z.array(imageDraftSchema),
		options: z.array(optionRowSchema).max(MAX_OPTIONS),
		variants: z.array(variantRowSchema).min(1),
		codAllowed: z.boolean(),
		pickupAllowed: z.boolean(),
		handlingHours: optionalAmount,
		returnPolicy: z.string(),
		status: z.enum(["draft", "active", "archived"]),
	})
	.refine(
		(state) =>
			state.existingImages.length + state.newImages.length <= MAX_IMAGES,
		{ path: ["newImages"] },
	);

export type ProductFormState = z.infer<typeof productFormSchema>;
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
 * variant. `optionValuesKey` keys by name and value, which is what the catalogue
 * compares; here only the position matters.
 */
function rowKey(values: Record<string, string>): string {
	return JSON.stringify(Object.values(values));
}

export function emptyVariant(
	optionValues: Record<string, string> = {},
): VariantRow {
	return {
		key: rowKey(optionValues),
		optionValues,
		sku: "",
		price: "",
		cost: "",
		threshold: "",
		initialStock: "",
		stockOnHand: null,
		trackInventory: true,
	};
}

export function emptyState(): ProductFormState {
	return {
		title: "",
		description: "",
		categoryId: null,
		condition: "",
		attributeValues: {},
		existingImages: [],
		newImages: [],
		options: [],
		variants: [emptyVariant()],
		codAllowed: true,
		pickupAllowed: false,
		handlingHours: "24",
		returnPolicy: "",
		status: "active",
	};
}

/**
 * Keeps every row whose combination still exists (and its id, so the server
 * updates rather than recreates it), adds rows for new combinations copying
 * the first row's price and cost, and drops the rest — the server archives a
 * variant that is no longer sent.
 */
export function reconcileVariants(
	options: OptionRow[],
	rows: VariantRow[],
): VariantRow[] {
	const combos = generateCombinations(options);
	const byKey = new Map(rows.map((row) => [rowKey(row.optionValues), row]));
	const template = rows[0];
	return combos.map((combo) => {
		const existing = byKey.get(rowKey(combo));
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
		price: String(variant.price ?? ""),
		cost:
			variant.cost === null || variant.cost === undefined
				? ""
				: String(variant.cost),
		threshold:
			variant.lowStockThreshold === null
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
		condition: String(product.condition ?? ""),
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
	includeCondition: boolean,
	includeCost: boolean,
): ProductInput {
	const options = usableOptions(state);
	return {
		title: state.title.trim(),
		description: state.description.trim() || null,
		category: state.categoryId ?? "",
		condition:
			includeCondition && state.condition
				? (state.condition as ProductInput["condition"])
				: null,
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
	};
}
