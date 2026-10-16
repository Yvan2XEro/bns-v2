import {
	type AttributeRuleDef,
	attributeValueIssues,
} from "./categoryAttributes";
import type { FieldIssue } from "./formIssues";
import { PHOTO_LIMIT, photoLimitIssue } from "./photoLimit";

/**
 * Every rule `POST /api/shops/:id/products` and `PATCH /api/products/:id`
 * apply to a product body that can be known without the database. The
 * service runs `productInputIssues` before anything else and refuses with
 * the issues it returns; the clients run the same function on what they are
 * about to send, step by step, so a save never fails on a rule the form
 * could have shown. SKU uniqueness across the shop and the category's
 * existence stay server-only and come back as issues on the same paths.
 */
export const PRODUCT_LIMITS = {
	titleMin: 3,
	titleMax: 120,
	descriptionMax: 5000,
	imagesMax: PHOTO_LIMIT.ceiling,
	optionsMax: 3,
	optionNameMax: 30,
	optionValueMax: 30,
	optionValuesMax: 20,
	variantsMax: 100,
	skuMax: 60,
	barcodeMax: 14,
	handlingHoursMax: 720,
	returnPolicyMax: 2000,
	warrantyMonthsMax: 60,
} as const;

export const PRODUCT_STATUS_VALUES = ["draft", "active", "archived"] as const;

export type ProductStep = "info" | "variants" | "publish";
export const PRODUCT_STEPS: readonly ProductStep[] = [
	"info",
	"variants",
	"publish",
];

/** Which wizard step shows the field at `path`. */
export function productIssueStep(path: string): ProductStep {
	const head = path.split(".")[0];
	if (head === "options" || head === "variants") return "variants";
	if (
		head === "status" ||
		head === "delivery" ||
		head === "returnPolicy" ||
		head === "warrantyMonths"
	) {
		return "publish";
	}
	return "info";
}

type Issues = FieldIssue[];

/** EAN-8, UPC-A, EAN-13 and GTIN-14: the lengths a retail scanner reads. */
export const BARCODE_LENGTHS: readonly number[] = [8, 12, 13, 14];

/** Spaces a seller types between digit groups are not part of the code. */
export function normalizeBarcode(value: string): string {
	return value.replace(/\s/g, "");
}

/**
 * Digits only, a GTIN length, and the GS1 check digit: a scan that lost a
 * digit or a typo is refused rather than stored as a code nothing will match.
 */
export function isValidBarcode(raw: string): boolean {
	const code = normalizeBarcode(raw);
	if (!/^\d+$/.test(code) || !BARCODE_LENGTHS.includes(code.length)) {
		return false;
	}
	const digits = [...code].map(Number);
	const check = digits.pop() ?? 0;
	let sum = 0;
	digits.reverse().forEach((digit, index) => {
		sum += digit * (index % 2 === 0 ? 3 : 1);
	});
	return (10 - (sum % 10)) % 10 === check;
}

/** The rule a variant's barcode breaks, or null when it is blank or valid. */
export function barcodeIssue(value: unknown): "text" | "barcode" | null {
	if (value === undefined || value === null) return null;
	if (typeof value !== "string") return "text";
	if (normalizeBarcode(value) === "") return null;
	return isValidBarcode(value) ? null : "barcode";
}

function isObject(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null;
}

const isBlank = (value: unknown) => value === undefined || value === null;

/** Mirrors the service's `text()`: null/undefined is "nothing", a non-string is refused. */
function checkText(
	issues: Issues,
	path: string,
	value: unknown,
	max: number,
): string | null {
	if (isBlank(value)) return null;
	if (typeof value !== "string") {
		issues.push({ path, rule: "text" });
		return null;
	}
	const trimmed = value.trim();
	if (trimmed.length > max) {
		issues.push({ path, rule: "maxLength", params: { max } });
		return null;
	}
	return trimmed || null;
}

/** Mirrors the service's `wholeNumber()`. */
function checkWhole(
	issues: Issues,
	path: string,
	value: unknown,
	options: { required: boolean; max?: number },
): void {
	if (value === undefined || value === null || value === "") {
		if (options.required) issues.push({ path, rule: "required" });
		return;
	}
	const n = Number(value);
	if (!Number.isInteger(n) || n < 0) {
		issues.push({ path, rule: "wholeNumber" });
		return;
	}
	if (options.max !== undefined && n > options.max) {
		issues.push({ path, rule: "max", params: { max: options.max } });
	}
}

interface CleanOption {
	name: string;
	values: string[];
}

function checkOptions(issues: Issues, raw: unknown): CleanOption[] | null {
	const rows = Array.isArray(raw) ? raw : [];
	const before = issues.length;
	if (rows.length > PRODUCT_LIMITS.optionsMax) {
		issues.push({
			path: "options",
			rule: "maxItems",
			params: { max: PRODUCT_LIMITS.optionsMax },
		});
	}
	const seen = new Set<string>();
	const options = rows.map((row, index) => {
		const option = isObject(row) ? row : {};
		const name = checkText(
			issues,
			`options.${index}.name`,
			option.name,
			PRODUCT_LIMITS.optionNameMax,
		);
		if (!name && !issues.some((i) => i.path === `options.${index}.name`)) {
			issues.push({ path: `options.${index}.name`, rule: "required" });
		}
		if (name) {
			const key = name.toLowerCase();
			if (seen.has(key)) {
				issues.push({ path: `options.${index}.name`, rule: "duplicate" });
			}
			seen.add(key);
		}
		const values = new Set<string>();
		if (Array.isArray(option.values)) {
			for (const value of option.values) {
				const clean = checkText(
					issues,
					`options.${index}.values`,
					value,
					PRODUCT_LIMITS.optionValueMax,
				);
				if (clean) values.add(clean);
			}
		}
		if (values.size === 0 || values.size > PRODUCT_LIMITS.optionValuesMax) {
			issues.push({
				path: `options.${index}.values`,
				rule: "count",
				params: { min: 1, max: PRODUCT_LIMITS.optionValuesMax },
			});
		}
		return { name: name ?? "", values: [...values] };
	});
	return issues.length === before ? options : null;
}

function checkVariants(
	issues: Issues,
	raw: unknown,
	options: CleanOption[] | null,
): void {
	const rows = Array.isArray(raw) ? raw : [];
	if (rows.length === 0 || rows.length > PRODUCT_LIMITS.variantsMax) {
		issues.push({
			path: "variants",
			rule: "count",
			params: { min: 1, max: PRODUCT_LIMITS.variantsMax },
		});
	}
	if (options && options.length === 0 && rows.length > 1) {
		issues.push({ path: "variants", rule: "single" });
	}

	const combos = new Set<string>();
	const skus = new Map<string, number>();
	const barcodes = new Set<string>();
	rows.forEach((row, index) => {
		const entry = isObject(row) ? row : {};
		const at = (field: string) => `variants.${index}.${field}`;

		// Option values are only meaningful against options that are themselves valid.
		if (options) {
			const values = isObject(entry.optionValues) ? entry.optionValues : {};
			const matches =
				Object.keys(values).length === options.length &&
				options.every((option) => {
					const value = values[option.name];
					return typeof value === "string" && option.values.includes(value);
				});
			if (!matches) {
				issues.push({ path: at("optionValues"), rule: "mismatch" });
			} else {
				const key = options
					.map((option) => `${option.name}=${values[option.name]}`)
					.join("|");
				if (combos.has(key)) {
					issues.push({ path: at("optionValues"), rule: "duplicate" });
				}
				combos.add(key);
			}
		}

		const sku = checkText(issues, at("sku"), entry.sku, PRODUCT_LIMITS.skuMax);
		if (sku) {
			if (skus.has(sku)) issues.push({ path: at("sku"), rule: "duplicate" });
			else skus.set(sku, index);
		}
		const barcodeRule = barcodeIssue(entry.barcode);
		if (barcodeRule) {
			issues.push({ path: at("barcode"), rule: barcodeRule });
		} else if (typeof entry.barcode === "string") {
			const code = normalizeBarcode(entry.barcode);
			if (code) {
				if (barcodes.has(code)) {
					issues.push({ path: at("barcode"), rule: "duplicate" });
				} else barcodes.add(code);
			}
		}
		checkWhole(issues, at("price"), entry.price, { required: true });
		checkWhole(issues, at("cost"), entry.cost, { required: false });
		checkWhole(issues, at("lowStockThreshold"), entry.lowStockThreshold, {
			required: false,
		});
		checkWhole(issues, at("initialStock"), entry.initialStock, {
			required: false,
		});
	});
}

export interface ProductValidationContext {
	/** The chosen category's attribute definitions, when the caller has them. */
	attributes?: readonly AttributeRuleDef[] | null;
	/** `photosIncluded` from the public config; the photo-count rule runs only when given. */
	photoLimit?: number | null;
	/** The saved product's photo count on an edit: keeping more than the limit is allowed, adding is not. */
	previousImageCount?: number | null;
}

export function productInputIssues(
	raw: unknown,
	context: ProductValidationContext = {},
): FieldIssue[] {
	const body = isObject(raw) ? raw : {};
	const issues: Issues = [];

	const title = checkText(issues, "title", body.title, PRODUCT_LIMITS.titleMax);
	if (
		!issues.some((i) => i.path === "title") &&
		(!title || title.length < PRODUCT_LIMITS.titleMin)
	) {
		issues.push({
			path: "title",
			rule: "length",
			params: { min: PRODUCT_LIMITS.titleMin, max: PRODUCT_LIMITS.titleMax },
		});
	}

	if (typeof body.category !== "string" || !body.category) {
		issues.push({ path: "category", rule: "required" });
	}

	if (Array.isArray(body.images)) {
		const ids = new Set(
			body.images.filter(
				(id): id is string => typeof id === "string" && id.length > 0,
			),
		);
		if (ids.size > PRODUCT_LIMITS.imagesMax) {
			issues.push({
				path: "images",
				rule: "maxItems",
				params: { max: PRODUCT_LIMITS.imagesMax },
			});
		} else if (
			context.photoLimit !== undefined &&
			context.photoLimit !== null
		) {
			const issue = photoLimitIssue(
				ids.size,
				context.previousImageCount,
				context.photoLimit,
			);
			if (issue) issues.push(issue);
		}
	}

	checkText(
		issues,
		"description",
		body.description,
		PRODUCT_LIMITS.descriptionMax,
	);

	if (context.attributes) {
		const values =
			isObject(body.attributes) && !Array.isArray(body.attributes)
				? body.attributes
				: {};
		for (const issue of attributeValueIssues(context.attributes, values)) {
			issues.push({
				path: issue.path,
				rule: issue.rule,
				...(issue.params ? { params: issue.params } : {}),
			});
		}
	}

	if (!PRODUCT_STATUS_VALUES.some((value) => value === body.status)) {
		issues.push({ path: "status", rule: "option" });
	}

	const options = checkOptions(issues, body.options);
	checkVariants(issues, body.variants, options);

	const delivery = isObject(body.delivery) ? body.delivery : {};
	checkWhole(issues, "delivery.handlingHours", delivery.handlingHours, {
		required: false,
		max: PRODUCT_LIMITS.handlingHoursMax,
	});
	checkWhole(issues, "delivery.weightGrams", delivery.weightGrams, {
		required: false,
	});
	checkText(
		issues,
		"returnPolicy",
		body.returnPolicy,
		PRODUCT_LIMITS.returnPolicyMax,
	);
	if (body.warrantyMonths !== undefined) {
		checkWhole(issues, "warrantyMonths", body.warrantyMonths, {
			required: false,
			max: PRODUCT_LIMITS.warrantyMonthsMax,
		});
	}

	return issues;
}
