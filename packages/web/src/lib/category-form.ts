/**
 * Data-driven listing form contract.
 *
 * A category tells the listing form which core fields to show (`formPreset`)
 * and which extra fields to render (`attributes`). Everything in this module is
 * defensive: the API shape is normalised here so the forms never have to guess
 * whether a flag is missing, null, or malformed.
 *
 * The shared `~/types` `Category` still carries the older, narrower shape, so
 * the raw values are read structurally rather than through that type.
 */

import type { Category } from "~/types";

export type ListingCategoryType =
	| "product"
	| "service"
	| "job"
	| "rental"
	| "generic";

const CATEGORY_TYPES: readonly ListingCategoryType[] = [
	"product",
	"service",
	"job",
	"rental",
	"generic",
];

export type AttributeType = "text" | "number" | "select" | "boolean" | "date";

const ATTRIBUTE_TYPES: readonly AttributeType[] = [
	"text",
	"number",
	"select",
	"boolean",
	"date",
];

export interface CoreFieldPreset {
	enabled: boolean;
	required: boolean;
	/** Category-supplied label override, e.g. "Loyer mensuel" instead of "Prix". */
	label?: string;
}

export interface ResolvedFormPreset {
	categoryType: ListingCategoryType;
	fields: {
		price: CoreFieldPreset;
		condition: CoreFieldPreset;
		/** Whether the form asks for pictures, and whether one is mandatory. */
		photos: CoreFieldPreset;
	};
}

export interface AttributeOptionSpec {
	value: string;
	label: string;
}

export interface CategoryAttributeSpec {
	name: string;
	slug: string;
	type: AttributeType;
	required: boolean;
	options: AttributeOptionSpec[];
	/** Suffix rendered after the value, e.g. "km", "m²". */
	unit?: string;
	/** Section heading this attribute belongs to. */
	group?: string;
	/** Bounds for `number` attributes. */
	min?: number;
	max?: number;
}

/**
 * Preset applied when a category carries none. Matches the historical
 * product-shaped behaviour so untouched categories keep working.
 */
export const DEFAULT_FORM_PRESET: ResolvedFormPreset = {
	categoryType: "product",
	fields: {
		price: { enabled: true, required: true },
		condition: { enabled: true, required: false },
		photos: { enabled: true, required: true },
	},
};

function asRecord(value: unknown): Record<string, unknown> | null {
	return typeof value === "object" && value !== null && !Array.isArray(value)
		? (value as Record<string, unknown>)
		: null;
}

function asBoolean(value: unknown, fallback: boolean): boolean {
	return typeof value === "boolean" ? value : fallback;
}

function asTrimmedString(value: unknown): string | undefined {
	if (typeof value !== "string") return undefined;
	const trimmed = value.trim();
	return trimmed.length > 0 ? trimmed : undefined;
}

function asFiniteNumber(value: unknown): number | undefined {
	if (typeof value === "number" && Number.isFinite(value)) return value;
	if (typeof value === "string" && value.trim() !== "") {
		const parsed = Number(value);
		if (Number.isFinite(parsed)) return parsed;
	}
	return undefined;
}

function resolveCoreField(
	raw: unknown,
	fallback: CoreFieldPreset,
): CoreFieldPreset {
	const record = asRecord(raw);
	const enabled = asBoolean(record?.enabled, fallback.enabled);
	// Invariant: a field that is not rendered can never be required, otherwise a
	// hidden field silently blocks submission.
	const required = enabled
		? asBoolean(record?.required, fallback.required)
		: false;
	const label = asTrimmedString(record?.label);
	return label ? { enabled, required, label } : { enabled, required };
}

/**
 * Normalise `category.formPreset` into a preset the forms can trust.
 * Categories without a preset fall back to the product-shaped default.
 */
export function resolveFormPreset(
	category?: Category | string | null,
): ResolvedFormPreset {
	if (!category || typeof category === "string") return DEFAULT_FORM_PRESET;

	const raw = asRecord((category as { formPreset?: unknown }).formPreset);
	if (!raw) return DEFAULT_FORM_PRESET;

	const fields = asRecord(raw.fields);
	const categoryType = raw.categoryType;

	return {
		categoryType: CATEGORY_TYPES.includes(categoryType as ListingCategoryType)
			? (categoryType as ListingCategoryType)
			: "generic",
		fields: {
			price: resolveCoreField(fields?.price, DEFAULT_FORM_PRESET.fields.price),
			condition: resolveCoreField(
				fields?.condition,
				DEFAULT_FORM_PRESET.fields.condition,
			),
			photos: resolveCoreField(
				fields?.photos,
				DEFAULT_FORM_PRESET.fields.photos,
			),
		},
	};
}

/**
 * Drop the photo requirement for a listing that already has no picture.
 *
 * Same reasoning as the server's image-cap hook: a rule introduced after a
 * listing was created must never make that listing unsavable. An ad written
 * before its category asked for photos — or one whose category was re-typed
 * since — stays editable, while an owner deleting the last picture of an ad
 * that has one is still stopped.
 */
export function relaxPhotoRequirement(
	preset: ResolvedFormPreset,
	hadPhotosAtLoad: boolean,
): ResolvedFormPreset {
	if (hadPhotosAtLoad || !preset.fields.photos.required) return preset;
	return {
		...preset,
		fields: {
			...preset.fields,
			photos: { ...preset.fields.photos, required: false },
		},
	};
}

/** True only for categories that actually sell an item you can hold. */
export function isProductCategory(
	category?: Category | string | null,
): boolean {
	return resolveFormPreset(category).categoryType === "product";
}

function normalizeOptions(raw: unknown): AttributeOptionSpec[] {
	if (!Array.isArray(raw)) return [];
	const options: AttributeOptionSpec[] = [];
	for (const entry of raw) {
		const record = asRecord(entry);
		const value = asTrimmedString(record?.value);
		if (!value) continue;
		options.push({ value, label: asTrimmedString(record?.label) ?? value });
	}
	return options;
}

/**
 * Normalise `category.attributes`, preserving the API's array order, which is
 * the intended display order.
 */
export function resolveCategoryAttributes(
	category?: Category | string | null,
): CategoryAttributeSpec[] {
	if (!category || typeof category === "string") return [];

	const raw = (category as { attributes?: unknown }).attributes;
	if (!Array.isArray(raw)) return [];

	const specs: CategoryAttributeSpec[] = [];
	for (const entry of raw) {
		const record = asRecord(entry);
		if (!record) continue;
		const slug = asTrimmedString(record.slug);
		if (!slug) continue;

		const type = ATTRIBUTE_TYPES.includes(record.type as AttributeType)
			? (record.type as AttributeType)
			: "text";
		const min = type === "number" ? asFiniteNumber(record.min) : undefined;
		const max = type === "number" ? asFiniteNumber(record.max) : undefined;

		specs.push({
			slug,
			name: asTrimmedString(record.name) ?? slug,
			type,
			required: asBoolean(record.required, false),
			options: normalizeOptions(record.options),
			unit: asTrimmedString(record.unit),
			group: asTrimmedString(record.group),
			min,
			max,
		});
	}
	return specs;
}

export interface AttributeGroup {
	/** `null` for attributes that declare no group: these render first. */
	group: string | null;
	attributes: CategoryAttributeSpec[];
}

/**
 * Bucket attributes by `group`, ungrouped ones first, groups in order of first
 * appearance. Order inside every bucket is the original array order.
 */
export function groupCategoryAttributes(
	attributes: CategoryAttributeSpec[],
): AttributeGroup[] {
	const ungrouped: CategoryAttributeSpec[] = [];
	const groups = new Map<string, CategoryAttributeSpec[]>();

	for (const attribute of attributes) {
		if (!attribute.group) {
			ungrouped.push(attribute);
			continue;
		}
		const bucket = groups.get(attribute.group);
		if (bucket) bucket.push(attribute);
		else groups.set(attribute.group, [attribute]);
	}

	const result: AttributeGroup[] = [];
	if (ungrouped.length > 0) result.push({ group: null, attributes: ungrouped });
	for (const [group, groupAttributes] of groups) {
		result.push({ group, attributes: groupAttributes });
	}
	return result;
}

export function isAttributeValueEmpty(value: string | undefined): boolean {
	return value === undefined || value.trim() === "";
}

export type AttributeIssue =
	| { slug: string; kind: "required" }
	| { slug: string; kind: "notANumber" }
	| { slug: string; kind: "min"; limit: number }
	| { slug: string; kind: "max"; limit: number };

/** Validate one attribute value. Returns `null` when the value is acceptable. */
export function validateAttributeValue(
	attribute: CategoryAttributeSpec,
	value: string | undefined,
): AttributeIssue | null {
	const { slug } = attribute;

	if (isAttributeValueEmpty(value)) {
		return attribute.required ? { slug, kind: "required" } : null;
	}

	if (attribute.type === "number") {
		const parsed = Number((value as string).trim());
		if (!Number.isFinite(parsed)) return { slug, kind: "notANumber" };
		if (attribute.min !== undefined && parsed < attribute.min) {
			return { slug, kind: "min", limit: attribute.min };
		}
		if (attribute.max !== undefined && parsed > attribute.max) {
			return { slug, kind: "max", limit: attribute.max };
		}
	}

	return null;
}

/** Every issue across the category's attributes, in attribute order. */
export function collectAttributeIssues(
	attributes: CategoryAttributeSpec[],
	values: Record<string, string>,
): AttributeIssue[] {
	const issues: AttributeIssue[] = [];
	for (const attribute of attributes) {
		const issue = validateAttributeValue(attribute, values[attribute.slug]);
		if (issue) issues.push(issue);
	}
	return issues;
}

/**
 * Drop values that do not belong to this category, and empty ones, so a
 * category switch never submits orphaned keys.
 */
export function pruneAttributeValues(
	attributes: CategoryAttributeSpec[],
	values: Record<string, string>,
): Record<string, string> {
	const pruned: Record<string, string> = {};
	for (const attribute of attributes) {
		const value = values[attribute.slug];
		if (!isAttributeValueEmpty(value)) pruned[attribute.slug] = value.trim();
	}
	return pruned;
}

/**
 * Title-field placeholder copy per category type, as a `Listing`-namespace key
 * plus a French fallback for keys that are not in the catalogues yet.
 *
 * The old form only knew "selling" vs "generic", so a job or a rental was
 * asked what it was selling. Each type now gets its own prompt.
 */
export function titlePlaceholderCopy(categoryType: ListingCategoryType): {
	key: string;
	fallback: string;
} {
	switch (categoryType) {
		case "product":
			return { key: "whatAreYouSelling", fallback: "Que vendez-vous ?" };
		case "service":
			return {
				key: "whatServiceAreYouOffering",
				fallback: "Quel service proposez-vous ?",
			};
		case "job":
			return {
				key: "whatRoleAreYouHiring",
				fallback: "Quel poste recrutez-vous ?",
			};
		case "rental":
			return { key: "whatAreYouRenting", fallback: "Que louez-vous ?" };
		default:
			return {
				key: "whatAreYouOffering",
				fallback: "De quoi parle cette annonce ?",
			};
	}
}

/**
 * Platform currency. Every category prices in XAF — rent and salaries just as
 * much as goods — so this is a platform constant, not a per-category concern
 * and not translatable copy.
 */
export const LISTING_CURRENCY = "XAF";

/**
 * Render an attribute value for read-only display (the review summary):
 * booleans become yes/no, select values become their option label, and the
 * unit is appended.
 */
export function formatAttributeValue(
	attribute: CategoryAttributeSpec,
	value: string | undefined,
	labels: { yes: string; no: string },
): string {
	if (isAttributeValueEmpty(value)) return "";
	const raw = (value as string).trim();

	if (attribute.type === "boolean") {
		return raw === "true" ? labels.yes : labels.no;
	}

	if (attribute.type === "select") {
		const option = attribute.options.find((entry) => entry.value === raw);
		return option ? option.label : raw;
	}

	return attribute.unit ? `${raw} ${attribute.unit}` : raw;
}

export type CoreFieldName = "price" | "condition" | "photos";

/**
 * Core (price / condition / photos) fields the preset requires but that are
 * unset. `photoCount` counts every picture the listing would be saved with,
 * existing ones included.
 */
export function collectCoreFieldIssues(
	preset: ResolvedFormPreset,
	values: { price: string; condition: string; photoCount: number },
): CoreFieldName[] {
	const missing: CoreFieldName[] = [];
	const { price, condition, photos } = preset.fields;
	// `enabled === false` already forces `required === false` in resolveFormPreset,
	// so a hidden field can never land here.
	if (price.required && values.price.trim() === "") missing.push("price");
	if (condition.required && values.condition.trim() === "") {
		missing.push("condition");
	}
	if (photos.required && values.photoCount <= 0) missing.push("photos");
	return missing;
}
