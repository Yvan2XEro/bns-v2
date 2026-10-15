import { describe, expect, it } from "vitest";
import {
	decorateCategoryWithFormPreset,
	getListingCategoryType,
	getListingFormPreset,
} from "../../src/lib/listingFormPreset";

describe("listing form preset", () => {
	it("defaults marketplace categories to the product preset", () => {
		expect(
			getListingFormPreset({
				slug: "phones-tablets",
				parent: { slug: "electronics" },
			}),
		).toMatchObject({
			categoryType: "product",
			fields: {
				price: { enabled: true, required: true },
			},
		});
	});

	it("disables product-only fields for job offers", () => {
		expect(
			getListingFormPreset({
				slug: "job-offers",
				parent: { slug: "jobs-services" },
			}),
		).toMatchObject({
			categoryType: "job",
			fields: {
				price: { enabled: false, required: false },
			},
		});
	});

	it("keeps price optional for services", () => {
		expect(
			getListingFormPreset({
				slug: "services",
				parent: { slug: "jobs-services" },
			}),
		).toMatchObject({
			categoryType: "service",
			fields: {
				price: { enabled: true, required: false },
			},
		});
	});

	it("no longer resolves a built-in condition field", () => {
		const preset = getListingFormPreset({
			slug: "phones",
			listingForm: { type: "product" },
		});
		expect(Object.keys(preset.fields)).toEqual(["price", "photos"]);
	});

	it("decorates categories with the resolved preset", () => {
		const category = decorateCategoryWithFormPreset({
			id: "1",
			name: "Job Offers",
			slug: "job-offers",
			parent: { slug: "jobs-services" },
		});

		expect(getListingCategoryType(category)).toBe("job");
		expect(category.listingType).toBe("job");
		expect(category.formPreset.categoryType).toBe("job");
	});
});
