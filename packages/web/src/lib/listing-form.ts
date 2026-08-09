import type { Category, ListingFormPreset } from "~/types";

export const DEFAULT_LISTING_FORM_PRESET: ListingFormPreset = {
	categoryType: "product",
	fields: {
		price: { enabled: true, required: true },
		condition: { enabled: true, required: false },
	},
};

export function getListingFormPreset(
	category?: Category | string | null,
): ListingFormPreset {
	if (!category || typeof category === "string") {
		return DEFAULT_LISTING_FORM_PRESET;
	}

	return category.formPreset ?? DEFAULT_LISTING_FORM_PRESET;
}

export function isProductListingCategory(
	category?: Category | string | null,
): boolean {
	return getListingFormPreset(category).categoryType === "product";
}
