/**
 * Presentation layer for a listing's dynamic attributes.
 *
 * A listing stores its attributes flat — `{ slug: value }` — while everything
 * needed to *show* them (human name, type, select options, unit, section) lives
 * on the category. Without joining the two the detail page prints raw slugs
 * ("fuel_type" instead of "Carburant") in whatever order the JSON happens to
 * hold.
 *
 * Everything here takes `unknown` and validates its way in, because both sides
 * of the join are unreliable at runtime:
 *   - `category` is a relationship: it arrives as a populated object at depth
 *     >= 1, but as a bare id string at depth 0, and as null on a deleted one.
 *   - an admin can delete an attribute definition while listings still carry
 *     its value, so a stored slug may have no definition at all. Those degrade
 *     to the slug as label rather than disappearing or throwing.
 *
 * Mirrors packages/mobile/src/lib/listingAttributes.ts — the two apps ship
 * separately and share no runtime package, so the logic is duplicated once per
 * package rather than hoisted into a new shared workspace.
 */

export type ListingAttributeType =
	| "boolean"
	| "date"
	| "number"
	| "select"
	| "text";

export interface ListingAttributeOption {
	value: string;
	label?: string | null;
}

export interface ListingAttributeDefinition {
	name: string;
	slug: string;
	type: ListingAttributeType;
	options?: ListingAttributeOption[] | null;
	/** Suffix appended after the value, e.g. "km", "m²". */
	unit?: string | null;
	/** Section heading this attribute is filed under. */
	group?: string | null;
}

/** One ready-to-render row: both strings are already user-facing. */
export interface DisplayAttribute {
	slug: string;
	label: string;
	value: string;
}

/** A section of rows. `title === null` means "render no heading". */
export interface DisplayAttributeGroup {
	key: string;
	title: string | null;
	items: DisplayAttribute[];
}

export interface FormatAttributeOptions {
	/** Localised "Yes" — pass t("yes"). */
	yes: string;
	/** Localised "No" — pass t("no"). */
	no: string;
	/** BCP 47 tag used for dates, e.g. "fr-FR". */
	locale?: string;
}

const ATTRIBUTE_TYPES: ListingAttributeType[] = [
	"text",
	"number",
	"select",
	"boolean",
	"date",
];

function isPlainObject(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function nonEmptyString(value: unknown): string | null {
	if (typeof value !== "string") return null;
	const trimmed = value.trim();
	return trimmed === "" ? null : trimmed;
}

/** Locale date string, or null when the input is missing or unparsable. */
function formatDateValue(value: unknown, locale?: string): string | null {
	if (value === null || value === undefined || value === "") return null;
	const date = value instanceof Date ? value : new Date(value as string);
	if (Number.isNaN(date.getTime())) return null;
	return date.toLocaleDateString(locale ?? "fr-FR");
}

function toOption(raw: unknown): ListingAttributeOption | null {
	// Options are `{ value, label? }` per the category contract, but a plain
	// string list is cheap to tolerate and has shown up in seed data.
	if (typeof raw === "string") {
		const value = raw.trim();
		return value === "" ? null : { value, label: null };
	}
	if (!isPlainObject(raw)) return null;
	const value =
		typeof raw.value === "string" || typeof raw.value === "number"
			? String(raw.value)
			: null;
	if (value === null || value === "") return null;
	return { value, label: nonEmptyString(raw.label) };
}

/**
 * Reads the attribute definitions off a listing's `category`.
 * Returns `[]` for an unpopulated (id string), null or malformed category —
 * callers then fall back to slugs instead of rendering nothing.
 */
export function readCategoryAttributeDefinitions(
	category: unknown,
): ListingAttributeDefinition[] {
	if (!isPlainObject(category)) return [];
	const raw = category.attributes;
	if (!Array.isArray(raw)) return [];

	const definitions: ListingAttributeDefinition[] = [];
	const seen = new Set<string>();

	for (const entry of raw) {
		if (!isPlainObject(entry)) continue;
		const slug = nonEmptyString(entry.slug);
		if (slug === null || seen.has(slug)) continue;
		seen.add(slug);

		const type = ATTRIBUTE_TYPES.includes(entry.type as ListingAttributeType)
			? (entry.type as ListingAttributeType)
			: "text";
		const options = Array.isArray(entry.options)
			? entry.options
					.map(toOption)
					.filter((option): option is ListingAttributeOption => option !== null)
			: null;

		definitions.push({
			name: nonEmptyString(entry.name) ?? slug,
			slug,
			type,
			options,
			unit: nonEmptyString(entry.unit),
			group: nonEmptyString(entry.group),
		});
	}

	return definitions;
}

function formatScalar(
	value: unknown,
	definition: ListingAttributeDefinition | null,
	options: FormatAttributeOptions,
): string | null {
	if (value === null || value === undefined) return null;
	if (typeof value === "string" && value.trim() === "") return null;

	const type = definition?.type;

	// Booleans win over the declared type: a checkbox answer is yes/no however
	// it was stored (true, "true", 1, "1").
	if (typeof value === "boolean") return value ? options.yes : options.no;
	if (value === "true") return options.yes;
	if (value === "false") return options.no;
	if (type === "boolean") {
		if (value === 1 || value === "1") return options.yes;
		if (value === 0 || value === "0") return options.no;
	}

	if (type === "select") {
		const text = String(value);
		const match = definition?.options?.find((option) => option.value === text);
		if (match) return match.label ?? match.value;
		return text;
	}

	if (type === "date") {
		return formatDateValue(value, options.locale) ?? String(value);
	}

	const text = String(value).trim();
	if (text === "") return null;
	// Numbers are not re-grouped: "2019" is as likely to be a model year as
	// 150000 is to be mileage, and 2 019 would be plainly wrong.
	return definition?.unit ? `${text} ${definition.unit}` : text;
}

function formatValue(
	value: unknown,
	definition: ListingAttributeDefinition | null,
	options: FormatAttributeOptions,
): string | null {
	if (Array.isArray(value)) {
		const parts = value
			.map((item) => formatScalar(item, definition, options))
			.filter((part): part is string => part !== null);
		return parts.length > 0 ? parts.join(", ") : null;
	}
	return formatScalar(value, definition, options);
}

/**
 * Joins a listing's stored attribute values with its category's definitions.
 *
 * Ordering follows the category's array — the order an admin arranged — and
 * values whose definition is gone are appended at the end, labelled with their
 * slug. Empty values are dropped. Rows are bucketed by `group`, groups keeping
 * first-appearance order; ungrouped rows sit in a headingless bucket.
 */
export function buildListingAttributeGroups(
	attributes: unknown,
	category: unknown,
	options: FormatAttributeOptions,
): DisplayAttributeGroup[] {
	const values = isPlainObject(attributes) ? attributes : {};
	const definitions = readCategoryAttributeDefinitions(category);

	const ordered: Array<{
		definition: ListingAttributeDefinition | null;
		slug: string;
	}> = [];
	const seen = new Set<string>();

	for (const definition of definitions) {
		if (!(definition.slug in values)) continue;
		seen.add(definition.slug);
		ordered.push({ definition, slug: definition.slug });
	}
	for (const slug of Object.keys(values)) {
		if (seen.has(slug)) continue;
		seen.add(slug);
		ordered.push({ definition: null, slug });
	}

	const groups: DisplayAttributeGroup[] = [];
	const byKey = new Map<string, DisplayAttributeGroup>();

	for (const { definition, slug } of ordered) {
		const value = formatValue(values[slug], definition, options);
		if (value === null) continue;

		const title = definition?.group ?? null;
		const key = title ?? "";
		let group = byKey.get(key);
		if (!group) {
			group = { key, title, items: [] };
			byKey.set(key, group);
			groups.push(group);
		}
		group.items.push({ slug, label: definition?.name ?? slug, value });
	}

	return groups;
}
