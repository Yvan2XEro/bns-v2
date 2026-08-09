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
				condition: { enabled: true, required: false },
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
				condition: { enabled: false, required: false },
			},
		});
	});

	it("keeps price optional and hides condition for services", () => {
		expect(
			getListingFormPreset({
				slug: "services",
				parent: { slug: "jobs-services" },
			}),
		).toMatchObject({
			categoryType: "service",
			fields: {
				price: { enabled: true, required: false },
				condition: { enabled: false, required: false },
			},
		});
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
