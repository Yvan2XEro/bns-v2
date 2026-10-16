import {
	type FieldIssue,
	firstIssueStep,
} from "../../../api/src/contracts/formIssues";
import {
	PRODUCT_LIMITS,
	PRODUCT_STEPS,
	type ProductStep,
	productInputIssues,
	productIssueStep,
} from "../../../api/src/contracts/productValidation";
import type {
	Category,
	ProductDetailResponse,
	ProductInput,
	ProductStatus,
} from "../types/api";
import {
	deserializeAttributeValues,
	getAttributeIssues,
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
	/** EAN/UPC digits; blank when the variant has none. */
	barcode?: string;
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
	/** Whole months of shop warranty; blank means none. */
	warrantyMonths: string;
}

export const MAX_OPTIONS = PRODUCT_LIMITS.optionsMax;

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
		barcode: "",
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
		warrantyMonths: "",
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
				barcode: (row.barcode ?? "").replace(/\s/g, "") || null,
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
		// Zero is no warranty, as on the web editor.
		warrantyMonths: parseAmount(state.warrantyMonths) || null,
	};
}

/** One stored image, whichever shape the API sent it in. */
function toProductImage(
	entry: NonNullable<ProductDetailResponse["product"]["images"]>[number],
): ProductImage | null {
	if ("image" in entry) {
		const image = entry.image;
		if (typeof image === "object" && image)
			return { id: String(image.id), uri: image.url ?? "" };
		return typeof image === "string" ? { id: image, uri: "" } : null;
	}
	return entry.id ? { id: entry.id, uri: entry.url ?? "" } : null;
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
		attributes: deserializeAttributeValues(
			getCategoryAttributes(category),
			product.attributes ?? {},
		),
		images: (product.images ?? [])
			.map(toProductImage)
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
				barcode: v.barcode ?? "",
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
		warrantyMonths:
			typeof product.warrantyMonths === "number" && product.warrantyMonths > 0
				? String(product.warrantyMonths)
				: "",
	};
}

/**
 * Everything the API would refuse in this form, on the paths of the body it
 * receives. The rules are the server's own (`productInputIssues`), run on what
 * `toProductInput` would send — except that an amount the seller left blank
 * or typed wrong stays missing here instead of becoming 0. The form adds the
 * category's own demands on top: its attributes as typed.
 */
export function productFormIssues(
	state: ProductFormState,
	attributes: ListingAttribute[],
	photos: {
		/** `photosIncluded` from the public config. */
		limit?: number;
		/** The saved product's photo count: an edit may keep more than the limit, not add. */
		previousCount?: number | null;
	} = {},
): FieldIssue[] {
	const input = toProductInput(state, attributes);
	const body = {
		...input,
		variants: input.variants.map((variant, index) => ({
			...variant,
			price: parseAmount(state.variants[index]?.price ?? ""),
		})),
	};
	const issues: FieldIssue[] = [];
	const add = (issue: FieldIssue) => {
		if (!issues.some((known) => known.path === issue.path)) issues.push(issue);
	};

	for (const [slug, issue] of Object.entries(
		getAttributeIssues(attributes, state.attributes),
	)) {
		add({
			path: `attributes.${slug}`,
			rule: issue.code,
			...(issue.code === "min" ? { params: { min: issue.bound } } : {}),
			...(issue.code === "max" ? { params: { max: issue.bound } } : {}),
		});
	}
	if (state.hasVariants && cleanOptions(state.options).length === 0) {
		add({ path: "options", rule: "required" });
	}
	for (const issue of productInputIssues(body, {
		attributes,
		photoLimit: photos.limit,
		previousImageCount: photos.previousCount,
	})) {
		add(issue);
	}
	return issues;
}

/** The issues the given wizard step shows. */
export function productStepIssues(
	issues: FieldIssue[],
	step: ProductStep,
): FieldIssue[] {
	return issues.filter((issue) => productIssueStep(issue.path) === step);
}

/** The first step holding one of the issues, as the wizard's 1-based number. */
export function firstProductIssueStep(issues: FieldIssue[]): 1 | 2 | 3 | null {
	const step = firstIssueStep(issues, productIssueStep, PRODUCT_STEPS);
	return step ? ((PRODUCT_STEPS.indexOf(step) + 1) as 1 | 2 | 3) : null;
}

export const WIZARD_STEPS: Record<1 | 2 | 3, ProductStep> = {
	1: "info",
	2: "variants",
	3: "publish",
};

/** "Continue" leaves a step only when nothing on it would be refused. */
export function canLeaveStep(issues: FieldIssue[], step: 1 | 2 | 3): boolean {
	return productStepIssues(issues, WIZARD_STEPS[step]).length === 0;
}
