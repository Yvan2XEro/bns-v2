type ParentRef =
	| {
			slug?: string | null;
			parent?: ParentRef | string | null;
	  }
	| string
	| null
	| undefined;

export type ListingCategoryType = "product" | "service" | "job" | "generic";

export interface ListingFormPreset {
	categoryType: ListingCategoryType;
	fields: {
		price: {
			enabled: boolean;
			required: boolean;
		};
		condition: {
			enabled: boolean;
			required: boolean;
		};
	};
}

export interface CategoryFormPresetInput {
	slug?: string | null;
	parent?: ParentRef;
}

const PRESETS: Record<ListingCategoryType, ListingFormPreset> = {
	product: {
		categoryType: "product",
		fields: {
			price: { enabled: true, required: true },
			condition: { enabled: true, required: false },
		},
	},
	service: {
		categoryType: "service",
		fields: {
			price: { enabled: true, required: false },
			condition: { enabled: false, required: false },
		},
	},
	job: {
		categoryType: "job",
		fields: {
			price: { enabled: false, required: false },
			condition: { enabled: false, required: false },
		},
	},
	generic: {
		categoryType: "generic",
		fields: {
			price: { enabled: false, required: false },
			condition: { enabled: false, required: false },
		},
	},
};

function collectSlugs(
	category: CategoryFormPresetInput | null | undefined,
): string[] {
	const slugs: string[] = [];
	let current: ParentRef | CategoryFormPresetInput | null | undefined =
		category;

	while (current && typeof current === "object") {
		if (typeof current.slug === "string" && current.slug.length > 0) {
			slugs.push(current.slug);
		}
		current = current.parent;
	}

	return slugs;
}

export function getListingCategoryType(
	category: CategoryFormPresetInput | null | undefined,
): ListingCategoryType {
	const slugs = collectSlugs(category);

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

export function getListingFormPreset(
	category: CategoryFormPresetInput | null | undefined,
): ListingFormPreset {
	return PRESETS[getListingCategoryType(category)];
}

export function decorateCategoryWithFormPreset<
	T extends CategoryFormPresetInput & Record<string, unknown>,
>(
	category: T,
): T & {
	listingType: ListingCategoryType;
	formPreset: ListingFormPreset;
} {
	const listingType = getListingCategoryType(category);
	return {
		...category,
		listingType,
		formPreset: PRESETS[listingType],
	};
}
