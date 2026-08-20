/**
 * Resolves which core fields (price, condition, photos) a listing form should
 * show for a given category.
 *
 * The category tree is data an admin edits, so the shape of its form is data
 * too: a category can carry a `listingForm` group that either names a preset
 * (`type`) or overrides a single field (`price`, `condition`, `photos`).
 * Anything left on `"auto"` (or absent) is inherited from the nearest ancestor
 * that says something, and only when nobody in the chain does we fall back to
 * the legacy slug whitelist. Categories with no `listingForm` therefore behave
 * exactly as they did before this file grew the group — that is what makes it
 * safe to deploy without a data migration.
 *
 * `photos` is resolved exactly like the other two, and for the same reason: a
 * job offer or a service has nothing to photograph, so "every ad needs a
 * picture" is a per-category rule rather than a platform one.
 */

/** How a single core field behaves. `auto` means "inherit, then fall back". */
export type ListingFormFieldMode = "auto" | "hidden" | "optional" | "required";

export type ListingCategoryType =
	| "product"
	| "service"
	| "job"
	| "rental"
	| "generic";

/** The `listingForm` group as stored on a category. Every member is optional. */
export interface CategoryListingFormConfig {
	type?: ListingCategoryType | "auto" | null;
	price?: ListingFormFieldMode | null;
	condition?: ListingFormFieldMode | null;
	photos?: ListingFormFieldMode | null;
	priceLabel?: string | null;
}

/** The core fields a category can configure, as stored on `listingForm`. */
type CoreFieldName = "price" | "condition" | "photos";

type ParentRef =
	| {
			slug?: string | null;
			parent?: ParentRef | string | null;
			listingForm?: CategoryListingFormConfig | null;
	  }
	| string
	| null
	| undefined;

export interface ListingFormPreset {
	categoryType: ListingCategoryType;
	fields: {
		price: {
			enabled: boolean;
			required: boolean;
			label?: string;
		};
		condition: {
			enabled: boolean;
			required: boolean;
		};
		photos: {
			enabled: boolean;
			required: boolean;
		};
	};
}

export interface CategoryFormPresetInput {
	slug?: string | null;
	parent?: ParentRef;
	listingForm?: CategoryListingFormConfig | null;
}

type PresetFields = ListingFormPreset["fields"];

const PRESETS: Record<ListingCategoryType, PresetFields> = {
	product: {
		price: { enabled: true, required: true },
		condition: { enabled: true, required: false },
		// A second-hand item is bought on its photo, so a product ad without one
		// is not worth publishing.
		photos: { enabled: true, required: true },
	},
	service: {
		price: { enabled: true, required: false },
		condition: { enabled: false, required: false },
		// A plumber may well have nothing to show; offer the field, do not insist.
		photos: { enabled: true, required: false },
	},
	job: {
		price: { enabled: false, required: false },
		condition: { enabled: false, required: false },
		// There is nothing to photograph in a job offer.
		photos: { enabled: false, required: false },
	},
	rental: {
		price: { enabled: true, required: true },
		condition: { enabled: false, required: false },
		photos: { enabled: true, required: true },
	},
	generic: {
		price: { enabled: false, required: false },
		condition: { enabled: false, required: false },
		photos: { enabled: true, required: false },
	},
};

const CATEGORY_TYPES = new Set<string>(Object.keys(PRESETS));

/**
 * Depth cap for the ancestor walk. The tree is two levels deep in practice; the
 * cap is a second line of defence next to the visited-set cycle guard, for the
 * case where the chain is long rather than circular.
 */
const MAX_ANCESTOR_DEPTH = 32;

type CategoryNode = {
	slug?: string | null;
	parent?: ParentRef | string | null;
	listingForm?: CategoryListingFormConfig | null;
};

/**
 * Walks a category and its ancestors, nearest first.
 *
 * A `parent` that is still an unpopulated id (a string) ends the walk: there is
 * nothing more to read without another database round trip, so the caller gets
 * what the requested `depth` made available.
 *
 * Guarded against a parent cycle in the data — `a.parent = b, b.parent = a`
 * would otherwise spin forever and hang the request. Nodes are tracked by
 * identity, which catches cycles inside a single populated payload, and the
 * depth cap catches anything the identity check cannot see.
 */
function collectChain(
	category: CategoryFormPresetInput | null | undefined,
): CategoryNode[] {
	const chain: CategoryNode[] = [];
	const visited = new Set<object>();
	let current: ParentRef | CategoryFormPresetInput | null | undefined =
		category;

	while (current && typeof current === "object") {
		if (visited.has(current)) break;
		visited.add(current);

		chain.push(current as CategoryNode);
		if (chain.length >= MAX_ANCESTOR_DEPTH) break;

		current = current.parent;
	}

	return chain;
}

function collectSlugsFromChain(chain: CategoryNode[]): string[] {
	const slugs: string[] = [];

	for (const node of chain) {
		if (typeof node.slug === "string" && node.slug.length > 0) {
			slugs.push(node.slug);
		}
	}

	return slugs;
}

/**
 * The pre-existing slug whitelist, kept verbatim as the last fallback so
 * categories that carry no `listingForm` resolve exactly as they used to.
 */
function getListingCategoryTypeFromSlugs(slugs: string[]): ListingCategoryType {
	if (slugs.includes("job-offers")) {
		return "job";
	}

	if (slugs.includes("services")) {
		return "service";
	}

	if (slugs.includes("jobs-services")) {
		return "generic";
	}

	return "product";
}

function readExplicitType(node: CategoryNode): ListingCategoryType | undefined {
	const value = node.listingForm?.type;
	if (typeof value !== "string" || value === "auto") return undefined;
	return CATEGORY_TYPES.has(value) ? (value as ListingCategoryType) : undefined;
}

function readExplicitMode(
	node: CategoryNode,
	field: CoreFieldName,
): Exclude<ListingFormFieldMode, "auto"> | undefined {
	const value = node.listingForm?.[field];
	if (typeof value !== "string" || value === "auto") return undefined;
	if (value === "hidden" || value === "optional" || value === "required") {
		return value;
	}
	return undefined;
}

function modeToField(mode: Exclude<ListingFormFieldMode, "auto">): {
	enabled: boolean;
	required: boolean;
} {
	switch (mode) {
		case "hidden":
			return { enabled: false, required: false };
		case "optional":
			return { enabled: true, required: false };
		case "required":
			return { enabled: true, required: true };
	}
}

/**
 * Nearest explicit override for one field, walking the chain.
 *
 * A node that names a preset `type` but says nothing about this field ends the
 * walk: its preset is the answer, so an ancestor further up must not leak
 * through. `undefined` means "no override — use the resolved preset".
 */
function resolveFieldMode(
	chain: CategoryNode[],
	field: CoreFieldName,
): Exclude<ListingFormFieldMode, "auto"> | undefined {
	for (const node of chain) {
		const mode = readExplicitMode(node, field);
		if (mode) return mode;
		if (readExplicitType(node)) return undefined;
	}

	return undefined;
}

function resolvePriceLabel(chain: CategoryNode[]): string | undefined {
	for (const node of chain) {
		const label = node.listingForm?.priceLabel;
		if (typeof label === "string" && label.trim().length > 0) {
			return label.trim();
		}
	}

	return undefined;
}

function resolveCategoryTypeFromChain(
	chain: CategoryNode[],
): ListingCategoryType {
	for (const node of chain) {
		const explicit = readExplicitType(node);
		if (explicit) return explicit;
	}

	return getListingCategoryTypeFromSlugs(collectSlugsFromChain(chain));
}

export function getListingCategoryType(
	category: CategoryFormPresetInput | null | undefined,
): ListingCategoryType {
	return resolveCategoryTypeFromChain(collectChain(category));
}

export function getListingFormPreset(
	category: CategoryFormPresetInput | null | undefined,
): ListingFormPreset {
	const chain = collectChain(category);
	const categoryType = resolveCategoryTypeFromChain(chain);
	const base = PRESETS[categoryType];

	const priceMode = resolveFieldMode(chain, "price");
	const conditionMode = resolveFieldMode(chain, "condition");
	const photosMode = resolveFieldMode(chain, "photos");

	const price: ListingFormPreset["fields"]["price"] = priceMode
		? modeToField(priceMode)
		: { ...base.price };

	// Echoed whenever it is set anywhere in the chain, without looking at
	// `enabled`: clients ignore the whole price block when the field is hidden,
	// and one unconditional rule is easier to code against than two.
	const label = resolvePriceLabel(chain);
	if (label) {
		price.label = label;
	}

	return {
		categoryType,
		fields: {
			price,
			condition: conditionMode
				? modeToField(conditionMode)
				: { ...base.condition },
			photos: photosMode ? modeToField(photosMode) : { ...base.photos },
		},
	};
}

export function decorateCategoryWithFormPreset<
	T extends CategoryFormPresetInput & Record<string, unknown>,
>(
	category: T,
): T & {
	listingType: ListingCategoryType;
	formPreset: ListingFormPreset;
} {
	const formPreset = getListingFormPreset(category);
	return {
		...category,
		listingType: formPreset.categoryType,
		formPreset,
	};
}
