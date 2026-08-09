import type { Category } from "@/src/types/api";

export const DEFAULT_LISTING_FORM_PRESET = {
	categoryType: "product" as const,
	fields: {
		price: { enabled: true, required: true },
		condition: { enabled: true, required: false },
	},
};

export function getListingFormPreset(category?: Category | string | null) {
	if (!category || typeof category === "string") {
		return DEFAULT_LISTING_FORM_PRESET;
	}

	return category.formPreset ?? DEFAULT_LISTING_FORM_PRESET;
}

export function isProductListingCategory(category?: Category | string | null) {
	return getListingFormPreset(category).categoryType === "product";
}
