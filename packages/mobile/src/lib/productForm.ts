import type {
	Category,
	ListingCondition,
	ProductDetailResponse,
	ProductInput,
	ProductStatus,
} from "../types/api";
import {
	deserializeAttributeValues,
	getCategoryAttributes,
	type ListingAttribute,
	serializeAttributeValues,
} from "./listingForm";
import { generateCombinations, type ProductOption } from "./variants";

export interface ProductImage {
	id: string;
	uri: string;
}

export interface VariantRow {
	key: string;
	id?: string;
	optionValues: Record<string, string>;
	sku: string;
	price: string;
	cost: string;
	initialStock: string;
	lowStockThreshold: string;
	trackInventory: boolean;
	/** Existing variants only; new variants use `initialStock`. */
	stockOnHand: number | null;
}

export interface ProductFormState {
	title: string;
	description: string;
	category: Category | null;
	condition: ListingCondition | null;
	attributes: Record<string, string>;
	images: ProductImage[];
	hasVariants: boolean;
	options: ProductOption[];
	variants: VariantRow[];
	samePrice: boolean;
	status: ProductStatus;
	codAllowed: boolean;
	pickupAllowed: boolean;
	handlingHours: string;
	returnPolicy: string;
}

export type InfoIssue = "title" | "category" | "description" | "images";
export type VariantIssue = "price" | "options";

export const MAX_PRODUCT_IMAGES = 10;
export const MAX_OPTIONS = 3;

/**
 * Digits and spaces only — a thousands separator survives, but a decimal
 * point, a minus sign, or a stray letter ("1e5", "0x1F") is refused outright
 * rather than silently reinterpreted into a different amount.
 */
export function parseAmount(value: string): number | null {
	const trimmed = value.trim();
	if (!trimmed || !/^[0-9\s]+$/.test(trimmed)) return null;
	const digits = trimmed.replace(/\s+/g, "");
	return digits ? Number(digits) : null;
}

/**
 * A row's identity string, used only as its React `key` (and as a display
 * label for `fromProductDetail`) — never for matching, see `syncVariantRows`.
 * Built from the option VALUES in option order, never the option names: web's
 * product form keyed rows by name, so a keystroke while renaming an option
 * rebuilt every row and dropped its id, SKU, price, cost, threshold and stock.
 */
function rowIdentity(optionValues: Record<string, string>): string {
	return Object.values(optionValues).join("\u0001");
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
 * removing one option leaves the other values in place and in order, so this
 * is what "still the same variant, with one more (or one fewer) option"
 * means — including the empty tuple of a product that has no options at all.
 */
function isSubsequence(short: string[], long: string[]): boolean {
	if (short.length > long.length) return false;
	let next = 0;
	for (const value of long) {
		if (next < short.length && short[next] === value) next++;
	}
	return next === short.length;
}

export function emptyVariantRow(
	optionValues: Record<string, string> = {},
): VariantRow {
	return {
		key: rowIdentity(optionValues),
		optionValues,
		sku: "",
		price: "",
		cost: "",
		initialStock: "",
		lowStockThreshold: "",
		trackInventory: true,
		stockOnHand: null,
	};
}

export function emptyProductForm(): ProductFormState {
	return {
		title: "",
		description: "",
		category: null,
		condition: null,
		attributes: {},
		images: [],
		hasVariants: false,
		options: [],
		variants: [emptyVariantRow()],
		samePrice: true,
		status: "active",
		codAllowed: true,
		pickupAllowed: false,
		handlingHours: "",
		returnPolicy: "",
	};
}

function cleanOptions(options: ProductOption[]): ProductOption[] {
	return options
		.map((o) => ({
			name: o.name.trim(),
			values: o.values.map((v) => v.trim()).filter(Boolean),
		}))
		.filter((o) => o.name && o.values.length > 0);
}

/**
 * Rows follow the option combinations; a surviving combination keeps its
 * row, its id, its price and its stock.
 *
 * Matching runs in two passes, and each row is claimed at most once — mirrors
 * `reconcileVariants` in `packages/web/src/lib/product-form.ts`, converged on
 * deliberately after both clients hit the same defect independently:
 *
 *  1. the identical tuple of values, which covers a rename and a value added
 *     or removed beside the ones already there;
 *  2. failing that, one tuple contained in the other (as a subsequence),
 *     which covers an option added or removed anywhere in the set — a simple
 *     product's single `{}` row becoming the first combination, the mirror
 *     collapse back to it, and an option inserted or dropped in the middle.
 *
 * Without the second pass, adding the first option to a simple product left
 * the live variant unmatched: the save created a duplicate and abandoned the
 * real one, stock and all.
 */
export function syncVariantRows(state: ProductFormState): VariantRow[] {
	const combos = state.hasVariants
		? generateCombinations(cleanOptions(state.options))
		: [{}];
	const tuples = combos.map(valueTuple);
	const unclaimed = [...state.variants];
	const template = state.variants[0];

	const claim = (
		matches: (tuple: string[]) => boolean,
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
		// Keep every other field, but refresh `optionValues` from the combo so a
		// renamed option's new name reaches the payload, not the stale one.
		if (existing)
			return { ...existing, key: rowIdentity(combo), optionValues: combo };

		const fresh = emptyVariantRow(combo);
		if (template) {
			fresh.price = template.price;
			fresh.cost = template.cost;
			fresh.lowStockThreshold = template.lowStockThreshold;
		}
		return fresh;
	});
}

export function toProductInput(
	state: ProductFormState,
	attributes: ListingAttribute[],
): ProductInput {
	const serialized = serializeAttributeValues(attributes, state.attributes);
	return {
		title: state.title.trim(),
		description: state.description.trim() || null,
		category: String(state.category?.id ?? ""),
		condition: state.condition,
		attributes: serialized,
		images: state.images.map((image) => image.id),
		status: state.status,
		options: state.hasVariants ? cleanOptions(state.options) : [],
		variants: state.variants.map((row) => {
			const initialStock = parseAmount(row.initialStock);
			return {
				...(row.id ? { id: row.id } : {}),
				optionValues: row.optionValues,
				sku: row.sku.trim() || null,
				price: parseAmount(row.price) ?? 0,
				cost: parseAmount(row.cost),
				trackInventory: row.trackInventory,
				lowStockThreshold: parseAmount(row.lowStockThreshold),
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

export function fromProductDetail(
	detail: ProductDetailResponse,
): ProductFormState {
	const { product, variants } = detail;
	const options = product.options ?? [];
	const category =
		typeof product.category === "object" ? product.category : null;
	return {
		title: product.title,
		description: product.description ?? "",
		category,
		condition: product.condition ?? null,
		attributes: deserializeAttributeValues(
			getCategoryAttributes(category),
			product.attributes ?? {},
		),
		images: (product.images ?? [])
			.map((entry) =>
				typeof entry.image === "object" && entry.image
					? { id: String(entry.image.id), uri: entry.image.url ?? "" }
					: typeof entry.image === "string"
						? { id: entry.image, uri: "" }
						: null,
			)
			.filter((image): image is ProductImage => image !== null),
		hasVariants: options.length > 0,
		options,
		variants: variants
			.filter((v) => !v.archivedAt)
			.map((v) => ({
				key: rowIdentity(v.optionValues ?? {}),
				id: v.id,
				optionValues: v.optionValues ?? {},
				sku: v.sku ?? "",
				price: String(v.price ?? ""),
				cost: v.cost === null || v.cost === undefined ? "" : String(v.cost),
				initialStock: "",
				lowStockThreshold:
					v.lowStockThreshold == null ? "" : String(v.lowStockThreshold),
				trackInventory: v.trackInventory,
				stockOnHand: v.stockOnHand,
			})),
		samePrice: new Set(variants.map((v) => v.price)).size <= 1,
		status: product.status,
		codAllowed: product.delivery?.codAllowed ?? true,
		pickupAllowed: product.delivery?.pickupAllowed ?? false,
		handlingHours:
			product.delivery?.handlingHours === null ||
			product.delivery?.handlingHours === undefined
				? ""
				: String(product.delivery.handlingHours),
		returnPolicy: product.returnPolicy ?? "",
	};
}

export function infoIssues(state: ProductFormState): InfoIssue[] {
	const issues: InfoIssue[] = [];
	const title = state.title.trim();
	if (title.length < 3 || title.length > 120) issues.push("title");
	if (!state.category) issues.push("category");
	if (state.description.length > 5000) issues.push("description");
	if (state.images.length > MAX_PRODUCT_IMAGES) issues.push("images");
	return issues;
}

export function variantIssues(state: ProductFormState): VariantIssue[] {
	const issues: VariantIssue[] = [];
	if (state.hasVariants && cleanOptions(state.options).length === 0) {
		issues.push("options");
	}
	if (state.variants.some((row) => parseAmount(row.price) === null)) {
		issues.push("price");
	}
	return issues;
}
