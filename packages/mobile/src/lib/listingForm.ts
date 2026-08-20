/**
 * Category-driven shape of the listing form.
 *
 * A category is data an admin edits, so the form is data too: the API decorates
 * every category with a `formPreset` (which of price/condition to show, and
 * whether they are required) and an ordered `attributes` array (the extra fields
 * that category asks for). Nothing about "an item being sold" may be hardcoded
 * in the screens — everything they show is derived here.
 *
 * The payload is server data, so every reader below is defensive: a missing,
 * partial or stale `formPreset`, options as plain strings instead of objects, a
 * `min` that arrived as a string — none of it may crash the create wizard.
 */

// ─── Preset ───────────────────────────────────────────────────────────────────

export type ListingCategoryType =
	| "product"
	| "service"
	| "job"
	| "rental"
	| "generic";

export interface ListingFormFieldConfig {
	enabled: boolean;
	required: boolean;
	/** Category-supplied override, e.g. "Loyer mensuel" instead of "Prix". */
	label?: string;
}

export interface ListingFormPreset {
	categoryType: ListingCategoryType;
	fields: {
		price: ListingFormFieldConfig;
		condition: ListingFormFieldConfig;
		/**
		 * Whether the wizard shows a photos step at all, and whether it insists
		 * on one. A job offer has nothing to photograph.
		 */
		photos: ListingFormFieldConfig;
	};
}

const CATEGORY_TYPES = new Set<string>([
	"product",
	"service",
	"job",
	"rental",
	"generic",
]);

/**
 * Used when the category cannot tell us anything: no category picked yet, a
 * category that came back as a bare id (an unpopulated relationship on the edit
 * screen), or a server that has not shipped `formPreset` yet.
 *
 * Deliberately *not* the product preset. "Unknown" is not "a product for sale":
 * assuming product made the edit screen demand a price on a job ad and show
 * "like new" chips on a holiday rental, and it made the form block submission on
 * a field the server does not even want. So the fallback shows both fields —
 * hiding them on the edit screen would visually drop values the listing already
 * holds — but requires neither. The server re-checks the real preset on write
 * (Listings.beforeChange), so being permissive here can never let bad data in.
 */
export const DEFAULT_LISTING_FORM_PRESET: ListingFormPreset = {
	categoryType: "generic",
	fields: {
		price: { enabled: true, required: false },
		condition: { enabled: true, required: false },
		// Same reasoning as the other two: show it, never insist, let the server
		// have the last word.
		photos: { enabled: true, required: false },
	},
};

function asRecord(value: unknown): Record<string, unknown> | null {
	return value && typeof value === "object" && !Array.isArray(value)
		? (value as Record<string, unknown>)
		: null;
}

function coerceBoolean(value: unknown, fallback: boolean): boolean {
	return typeof value === "boolean" ? value : fallback;
}

function coerceOptionalString(value: unknown): string | undefined {
	if (typeof value !== "string") return undefined;
	const trimmed = value.trim();
	return trimmed.length > 0 ? trimmed : undefined;
}

function coerceOptionalNumber(value: unknown): number | undefined {
	if (typeof value === "number") {
		return Number.isFinite(value) ? value : undefined;
	}
	if (typeof value === "string" && value.trim() !== "") {
		const parsed = Number(value);
		return Number.isFinite(parsed) ? parsed : undefined;
	}
	return undefined;
}

function coerceField(
	raw: unknown,
	fallback: ListingFormFieldConfig,
): ListingFormFieldConfig {
	const record = asRecord(raw);
	if (!record) return { ...fallback };

	const enabled = coerceBoolean(record.enabled, fallback.enabled);
	const field: ListingFormFieldConfig = {
		enabled,
		// A hidden field is never required — a field the user cannot see must not
		// be able to block submission.
		required: enabled
			? coerceBoolean(record.required, fallback.required)
			: false,
	};

	const label = coerceOptionalString(record.label);
	if (label && enabled) field.label = label;

	return field;
}

/**
 * Resolves the preset for a category object as returned by
 * `/api/public/categories` (or embedded in a listing).
 */
export function getListingFormPreset(category?: unknown): ListingFormPreset {
	const categoryRecord = asRecord(category);
	const preset = asRecord(categoryRecord?.formPreset);
	if (!preset) return DEFAULT_LISTING_FORM_PRESET;

	const rawType = preset.categoryType;
	const categoryType =
		typeof rawType === "string" && CATEGORY_TYPES.has(rawType)
			? (rawType as ListingCategoryType)
			: DEFAULT_LISTING_FORM_PRESET.categoryType;

	const fields = asRecord(preset.fields) ?? {};

	return {
		categoryType,
		fields: {
			price: coerceField(
				fields.price,
				DEFAULT_LISTING_FORM_PRESET.fields.price,
			),
			condition: coerceField(
				fields.condition,
				DEFAULT_LISTING_FORM_PRESET.fields.condition,
			),
			photos: coerceField(
				fields.photos,
				DEFAULT_LISTING_FORM_PRESET.fields.photos,
			),
		},
	};
}

export function getListingCategoryType(
	category?: unknown,
): ListingCategoryType {
	return getListingFormPreset(category).categoryType;
}

export function isProductListingCategory(category?: unknown): boolean {
	return getListingCategoryType(category) === "product";
}

/** Ionicon for a category that has no icon of its own, per kind of ad. */
export function getListingCategoryIcon(category?: unknown): string {
	switch (getListingCategoryType(category)) {
		case "product":
			return "cube-outline";
		case "service":
			return "construct-outline";
		case "job":
			return "briefcase-outline";
		case "rental":
			return "key-outline";
		default:
			return "pricetag-outline";
	}
}

// ─── Attributes ───────────────────────────────────────────────────────────────

export type ListingAttributeType =
	| "text"
	| "number"
	| "select"
	| "boolean"
	| "date";

export interface ListingAttributeOption {
	value: string;
	label: string;
}

export interface ListingAttribute {
	name: string;
	slug: string;
	type: ListingAttributeType;
	required: boolean;
	options: ListingAttributeOption[];
	/** Suffix shown after the value, e.g. "km", "m²". */
	unit?: string;
	/** Section heading this attribute is filed under. */
	group?: string;
	min?: number;
	max?: number;
}

const ATTRIBUTE_TYPES = new Set<string>([
	"text",
	"number",
	"select",
	"boolean",
	"date",
]);

function normalizeOptions(raw: unknown): ListingAttributeOption[] {
	if (!Array.isArray(raw)) return [];

	const options: ListingAttributeOption[] = [];
	for (const entry of raw) {
		// Options are `{ value, label? }` per the API contract, but older payloads
		// (and the Payload admin array field) hand back plain strings or
		// `{ value }` only.
		if (typeof entry === "string") {
			const value = entry.trim();
			if (value) options.push({ value, label: value });
			continue;
		}
		const record = asRecord(entry);
		const value = coerceOptionalString(record?.value);
		if (!value) continue;
		options.push({
			value,
			label: coerceOptionalString(record?.label) ?? value,
		});
	}
	return options;
}

/** Reads the ordered attribute list off a category, normalising every entry. */
export function getCategoryAttributes(category?: unknown): ListingAttribute[] {
	const raw = asRecord(category)?.attributes;
	if (!Array.isArray(raw)) return [];

	const attributes: ListingAttribute[] = [];
	for (const entry of raw) {
		const record = asRecord(entry);
		if (!record) continue;

		const slug = coerceOptionalString(record.slug);
		if (!slug) continue;

		const rawType = record.type;
		const type: ListingAttributeType =
			typeof rawType === "string" && ATTRIBUTE_TYPES.has(rawType)
				? (rawType as ListingAttributeType)
				: "text";

		const attribute: ListingAttribute = {
			slug,
			name: coerceOptionalString(record.name) ?? slug,
			type,
			required: record.required === true,
			options: type === "select" ? normalizeOptions(record.options) : [],
		};

		const unit = coerceOptionalString(record.unit);
		if (unit) attribute.unit = unit;
		const group = coerceOptionalString(record.group);
		if (group) attribute.group = group;

		if (type === "number") {
			const min = coerceOptionalNumber(record.min);
			if (min !== undefined) attribute.min = min;
			const max = coerceOptionalNumber(record.max);
			if (max !== undefined) attribute.max = max;
		}

		attributes.push(attribute);
	}

	return attributes;
}

export interface ListingAttributeSection {
	key: string;
	/** Undefined for the leading section of ungrouped attributes. */
	title?: string;
	attributes: ListingAttribute[];
}

/**
 * Splits attributes into sections. Ungrouped attributes come first, then each
 * group in the order it first appears, and the API's array order is preserved
 * inside every section.
 */
export function groupListingAttributes(
	attributes: ListingAttribute[],
): ListingAttributeSection[] {
	const ungrouped: ListingAttribute[] = [];
	const sections = new Map<string, ListingAttributeSection>();

	for (const attribute of attributes) {
		if (!attribute.group) {
			ungrouped.push(attribute);
			continue;
		}
		const existing = sections.get(attribute.group);
		if (existing) {
			existing.attributes.push(attribute);
		} else {
			sections.set(attribute.group, {
				key: `group-${attribute.group}`,
				title: attribute.group,
				attributes: [attribute],
			});
		}
	}

	return [
		...(ungrouped.length > 0
			? [{ key: "ungrouped", attributes: ungrouped }]
			: []),
		...sections.values(),
	];
}

// ─── Values ───────────────────────────────────────────────────────────────────

/**
 * Every input in the form edits a string; the typed value is produced only on
 * submit. `serializeAttributeValues` is what the server sees.
 */
export type AttributeFormValues = Record<string, string>;

/** Digits, one decimal separator, optional leading minus. Never clamps. */
export function sanitizeNumberInput(input: string): string {
	const cleaned = input.replace(/[^0-9.,-]/g, "").replace(/,/g, ".");
	const negative = cleaned.startsWith("-");
	const digits = cleaned.replace(/-/g, "");
	const [whole, ...rest] = digits.split(".");
	const joined = rest.length > 0 ? `${whole}.${rest.join("")}` : whole;
	return negative ? `-${joined}` : joined;
}

/** Prices are whole XAF amounts; anything else makes `Number(price)` NaN. */
export function sanitizePriceInput(input: string): string {
	return input.replace(/[^0-9]/g, "");
}

export function parseNumberValue(input: unknown): number | null {
	if (typeof input === "number") {
		return Number.isFinite(input) ? input : null;
	}
	if (typeof input !== "string") return null;
	const trimmed = sanitizeNumberInput(input);
	if (trimmed === "" || trimmed === "-" || trimmed === "." || trimmed === "-.")
		return null;
	const parsed = Number(trimmed);
	return Number.isFinite(parsed) ? parsed : null;
}

// ─── Dates ────────────────────────────────────────────────────────────────────
//
// The project has no date-picker dependency (checked packages/mobile/package.json
// — no @react-native-community/datetimepicker, no expo date picker), and adding
// one is out of scope, so a `date` attribute is edited as a masked numeric
// TextInput: the user types digits and gets "31/12/2026". The stored value is
// always the unambiguous ISO "YYYY-MM-DD", which is what the API validates.

/** Formats keystrokes as DD/MM/YYYY without ever rejecting a partial entry. */
export function maskDateInput(input: string): string {
	const digits = input.replace(/[^0-9]/g, "").slice(0, 8);
	const day = digits.slice(0, 2);
	const month = digits.slice(2, 4);
	const year = digits.slice(4, 8);
	return [day, month, year].filter((part) => part.length > 0).join("/");
}

/** "31/12/2026" → "2026-12-31". Returns null unless it is a real calendar date. */
export function parseDateInput(input: string): string | null {
	const digits = input.replace(/[^0-9]/g, "");
	if (digits.length !== 8) return null;

	const day = Number(digits.slice(0, 2));
	const month = Number(digits.slice(2, 4));
	const year = Number(digits.slice(4, 8));
	if (month < 1 || month > 12 || day < 1 || year < 1900) return null;

	// Built from parts rather than parsed from a string so the value never shifts
	// by a day across timezones.
	const date = new Date(Date.UTC(year, month - 1, day));
	if (
		date.getUTCFullYear() !== year ||
		date.getUTCMonth() !== month - 1 ||
		date.getUTCDate() !== day
	) {
		return null;
	}

	const pad = (value: number) => String(value).padStart(2, "0");
	return `${year}-${pad(month)}-${pad(day)}`;
}

/** Stored ISO (or anything date-ish) → "DD/MM/YYYY" for display and editing. */
export function formatDateValue(value: unknown): string {
	if (typeof value !== "string" || value.trim() === "") return "";

	const iso = value.trim().slice(0, 10);
	const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
	if (match) return `${match[3]}/${match[2]}/${match[1]}`;

	// Already typed as DD/MM/YYYY (a value the user is mid-way through editing).
	return maskDateInput(value);
}

// ─── Validation ───────────────────────────────────────────────────────────────

export type AttributeIssue =
	| { code: "required" }
	| { code: "number" }
	| { code: "min"; bound: number }
	| { code: "max"; bound: number }
	| { code: "date" };

/**
 * One attribute's problem, or null when it is fine. Out-of-range numbers are
 * reported, never clamped: silently rewriting what someone typed is worse than
 * telling them the bound.
 */
export function getAttributeIssue(
	attribute: ListingAttribute,
	rawValue: unknown,
): AttributeIssue | null {
	const value =
		rawValue === undefined || rawValue === null ? "" : String(rawValue).trim();

	if (value === "") {
		return attribute.required ? { code: "required" } : null;
	}

	if (attribute.type === "number") {
		const parsed = parseNumberValue(value);
		if (parsed === null) return { code: "number" };
		if (attribute.min !== undefined && parsed < attribute.min) {
			return { code: "min", bound: attribute.min };
		}
		if (attribute.max !== undefined && parsed > attribute.max) {
			return { code: "max", bound: attribute.max };
		}
		return null;
	}

	if (attribute.type === "date" && parseDateInput(value) === null) {
		return { code: "date" };
	}

	return null;
}

export function getAttributeIssues(
	attributes: ListingAttribute[],
	values: Record<string, unknown>,
): Record<string, AttributeIssue> {
	const issues: Record<string, AttributeIssue> = {};
	for (const attribute of attributes) {
		const issue = getAttributeIssue(attribute, values?.[attribute.slug]);
		if (issue) issues[attribute.slug] = issue;
	}
	return issues;
}

export function areAttributesValid(
	attributes: ListingAttribute[],
	values: Record<string, unknown>,
): boolean {
	return attributes.every(
		(attribute) =>
			getAttributeIssue(attribute, values?.[attribute.slug]) === null,
	);
}

// ─── Serialisation ────────────────────────────────────────────────────────────

/**
 * Form strings → the typed JSON the API expects. The server rejects a number
 * attribute sent as "120" and a boolean sent as "true" (see
 * `validateListingAttributes`), so this conversion is not cosmetic.
 *
 * Attributes of other categories are dropped: switching category must not leave
 * the previous category's answers in the payload.
 */
export function serializeAttributeValues(
	attributes: ListingAttribute[],
	values: Record<string, unknown>,
): Record<string, string | number | boolean> {
	const payload: Record<string, string | number | boolean> = {};

	for (const attribute of attributes) {
		const raw = values?.[attribute.slug];
		const value = raw === undefined || raw === null ? "" : String(raw).trim();
		if (value === "") continue;

		switch (attribute.type) {
			case "number": {
				const parsed = parseNumberValue(value);
				if (parsed !== null) payload[attribute.slug] = parsed;
				break;
			}
			case "boolean":
				payload[attribute.slug] = value === "true";
				break;
			case "date": {
				const iso = parseDateInput(value);
				if (iso) payload[attribute.slug] = iso;
				break;
			}
			default:
				payload[attribute.slug] = value;
		}
	}

	return payload;
}

/** Stored JSON → the strings the inputs edit (used when loading a listing). */
export function deserializeAttributeValues(
	attributes: ListingAttribute[],
	stored: unknown,
): AttributeFormValues {
	const record = asRecord(stored);
	const values: AttributeFormValues = {};
	if (!record) return values;

	for (const attribute of attributes) {
		const raw = record[attribute.slug];
		if (raw === undefined || raw === null || raw === "") continue;

		if (attribute.type === "boolean") {
			values[attribute.slug] =
				raw === true || raw === "true" ? "true" : "false";
			continue;
		}
		if (attribute.type === "date") {
			values[attribute.slug] = formatDateValue(String(raw));
			continue;
		}
		values[attribute.slug] = String(raw);
	}

	return values;
}

/** Human-readable value for a summary row: option label, unit, yes/no, date. */
export function formatAttributeValue(
	attribute: ListingAttribute,
	rawValue: unknown,
	labels: { yes: string; no: string },
): string {
	const value =
		rawValue === undefined || rawValue === null ? "" : String(rawValue).trim();
	if (value === "") return "";

	if (attribute.type === "boolean") {
		return value === "true" ? labels.yes : labels.no;
	}

	if (attribute.type === "date") {
		return formatDateValue(value);
	}

	if (attribute.type === "select") {
		const option = attribute.options.find((opt) => opt.value === value);
		return option?.label ?? value;
	}

	return attribute.unit ? `${value} ${attribute.unit}` : value;
}
