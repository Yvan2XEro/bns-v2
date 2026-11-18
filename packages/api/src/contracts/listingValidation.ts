import {
	type AttributeRuleDef,
	attributeValueIssues,
} from "./categoryAttributes";
import type { FieldIssue } from "./formIssues";
import { listingTagIssues } from "./listingTags";
import { PHOTO_LIMIT, photoLimitIssue } from "./photoLimit";

/**
 * The rules a classified listing (`POST`/`PATCH /api/listings`) is held to.
 * The Listings hook runs the price check below; the clients run
 * `listingInputIssues` on what they are about to send. One rule is the
 * form's alone: the server deliberately does not enforce a category's
 * "photos: required" on write (see the `images` field in
 * `collections/Listings.ts`), but a form that shows the asterisk must not
 * let the seller past it either. The item's condition is a category
 * attribute, checked with the others. The photo count follows the admin
 * setting through `photoLimitIssue`, the same rule shop products follow.
 */

export interface ListingFieldPreset {
	enabled: boolean;
	required: boolean;
}

export interface ListingPresetFields {
	price: ListingFieldPreset;
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

export interface ListingValidationContext {
	preset?: ListingPresetFields | null;
	attributes?: readonly AttributeRuleDef[] | null;
	/** Growing past the photo limit is refused; a legacy listing already over it is not. */
	previousImageCount?: number;
	/** `photosIncluded` from the public config; the default limit when absent. */
	photoLimit?: number | null;
	/** Ids of the tags that apply to the chosen category, once the form has loaded them. */
	tags?: readonly string[] | null;
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
	}

	const images = Array.isArray(body.images) ? body.images.length : 0;
	const photoIssue = photoLimitIssue(
		images,
		context.previousImageCount,
		context.photoLimit ?? PHOTO_LIMIT.default,
	);
	if (photoIssue) issues.push(photoIssue);
	if (preset?.photos?.enabled && preset.photos.required && images === 0) {
		issues.push({ path: "images", rule: "required" });
	}

	if (context.tags) {
		issues.push(...listingTagIssues(body.tags, context.tags));
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
