import {
	type AttributeRuleDef,
	attributeValueIssues,
} from "./categoryAttributes";
import type { FieldIssue } from "./formIssues";

/**
 * The rules a classified listing (`POST`/`PATCH /api/listings`) is held to.
 * The Listings hook runs the price and condition checks below; the clients
 * run `listingInputIssues` on what they are about to send. Two rules are the
 * form's alone and marked so: the server deliberately does not enforce a
 * category's "photos: required" or "condition: required" on write (see the
 * `images` field in `collections/Listings.ts`), but a form that shows the
 * asterisk must not let the seller past it either.
 */
export const LISTING_LIMITS = { imagesMax: 3 } as const;

export const LISTING_CONDITION_VALUES = [
	"new",
	"like_new",
	"good",
	"fair",
	"poor",
] as const;

export interface ListingFieldPreset {
	enabled: boolean;
	required: boolean;
}

export interface ListingPresetFields {
	price: ListingFieldPreset;
	condition: ListingFieldPreset;
	photos?: ListingFieldPreset;
}

export type ListingStep =
	| "describe"
	| "attributes"
	| "details"
	| "photos"
	| "review";

/** Which step of either client's listing wizard shows the field at `path`. */
export function listingIssueStep(path: string): ListingStep {
	const head = path.split(".")[0];
	if (head === "title" || head === "description" || head === "category") {
		return "describe";
	}
	if (head === "attributes") return "attributes";
	if (head === "images") return "photos";
	return "details";
}

const isEmpty = (value: unknown) =>
	value === undefined || value === null || value === "";

/** The price as the hook stores it: null for nothing, NaN for garbage. */
export function normalizeListingPrice(value: unknown): number | null {
	if (value === null || value === undefined || value === "") return null;
	if (typeof value === "number") {
		return Number.isFinite(value) ? value : Number.NaN;
	}
	if (typeof value === "string") {
		const trimmed = value.trim();
		if (!trimmed) return null;
		return Number(trimmed);
	}
	return Number.NaN;
}

export function listingPriceIssue(
	field: ListingFieldPreset,
	value: unknown,
): FieldIssue | null {
	if (!field.enabled) return null;
	const price = normalizeListingPrice(value);
	if (field.required && price === null) {
		return { path: "price", rule: "required" };
	}
	if (price !== null && !Number.isFinite(price)) {
		return { path: "price", rule: "number" };
	}
	return null;
}

export function listingConditionIssue(
	field: ListingFieldPreset,
	value: unknown,
): FieldIssue | null {
	if (!field.enabled || isEmpty(value)) return null;
	return LISTING_CONDITION_VALUES.some((condition) => condition === value)
		? null
		: { path: "condition", rule: "option" };
}

export interface ListingValidationContext {
	preset?: ListingPresetFields | null;
	attributes?: readonly AttributeRuleDef[] | null;
	/** Growing past the image cap is refused; a legacy listing already over it is not. */
	previousImageCount?: number;
}

export function listingInputIssues(
	raw: unknown,
	context: ListingValidationContext = {},
): FieldIssue[] {
	const body =
		typeof raw === "object" && raw !== null
			? (raw as Record<string, unknown>)
			: {};
	const issues: FieldIssue[] = [];
	const filled = (value: unknown) =>
		typeof value === "string" ? value.trim().length > 0 : !isEmpty(value);

	if (!filled(body.title)) issues.push({ path: "title", rule: "required" });
	if (!filled(body.description)) {
		issues.push({ path: "description", rule: "required" });
	}
	if (!filled(body.category)) {
		issues.push({ path: "category", rule: "required" });
	}
	if (!filled(body.location)) {
		issues.push({ path: "location", rule: "required" });
	}

	const preset = context.preset;
	if (preset) {
		const price = listingPriceIssue(preset.price, body.price);
		if (price) issues.push(price);
		const condition = listingConditionIssue(preset.condition, body.condition);
		if (condition) issues.push(condition);
		if (
			preset.condition.enabled &&
			preset.condition.required &&
			isEmpty(body.condition)
		) {
			issues.push({ path: "condition", rule: "required" });
		}
	}

	const images = Array.isArray(body.images) ? body.images.length : 0;
	if (
		images > LISTING_LIMITS.imagesMax &&
		images > (context.previousImageCount ?? 0)
	) {
		issues.push({
			path: "images",
			rule: "maxItems",
			params: { max: LISTING_LIMITS.imagesMax },
		});
	}
	if (preset?.photos?.enabled && preset.photos.required && images === 0) {
		issues.push({ path: "images", rule: "required" });
	}

	if (context.attributes) {
		const values =
			typeof body.attributes === "object" &&
			body.attributes !== null &&
			!Array.isArray(body.attributes)
				? (body.attributes as Record<string, unknown>)
				: {};
		for (const issue of attributeValueIssues(context.attributes, values)) {
			issues.push({
				path: issue.path,
				rule: issue.rule,
				...(issue.params ? { params: issue.params } : {}),
			});
		}
	}

	return issues;
}
