import { beforeEach, describe, expect, it, vi } from "vitest";

const validateListingAttributesMock = vi.fn();

vi.mock("../../src/hooks/validation", () => ({
	validateListingAttributes: validateListingAttributesMock,
}));

describe("listings beforeChange hook", () => {
	beforeEach(() => {
		validateListingAttributesMock.mockReset();
		validateListingAttributesMock.mockResolvedValue([]);
	});

	it("skips commercial form validation for unrelated system updates", async () => {
		const findByIDMock = vi.fn();
		const { Listings } = await import("../../src/collections/Listings");
		const beforeChange = Listings.hooks?.beforeChange?.[0];

		expect(beforeChange).toBeTypeOf("function");

		const data = {
			id: "listing-1",
			title: "Senior Designer",
			category: { id: "jobs-category" },
			price: null,
			condition: null,
			attributes: { contractType: "full_time" },
			status: "published",
			boostedUntil: "2026-08-16T12:00:00.000Z",
		};

		const result = await beforeChange?.({
			data,
			req: {
				payload: {
					findByID: findByIDMock,
				},
			},
			operation: "update",
			originalDoc: {
				...data,
				boostedUntil: null,
			},
		});

		expect(findByIDMock).not.toHaveBeenCalled();
		expect(validateListingAttributesMock).not.toHaveBeenCalled();
		expect(result?.boostedUntil).toBe("2026-08-16T12:00:00.000Z");
	});

	describe("kind and price unit", () => {
		const rentalCategory = {
			id: "cat-rent",
			slug: "apartments",
			// Price optional, so a test can drop it.
			listingForm: { type: "rental", price: "optional" },
		};

		async function write(
			data: Record<string, unknown>,
			originalDoc?: Record<string, unknown>,
		) {
			const { Listings } = await import("../../src/collections/Listings");
			const beforeChange = Listings.hooks?.beforeChange?.[0];
			return beforeChange?.({
				data: { ...originalDoc, ...data },
				req: {
					payload: { findByID: vi.fn(async () => rentalCategory) },
					context: {},
				},
				operation: originalDoc ? "update" : "create",
				originalDoc,
			});
		}

		const ad = {
			title: "F3 à Bonamoussadi",
			category: "cat-rent",
			price: 150000,
			attributes: {},
			status: "published",
		};

		it("copies the category's kind and ignores the one a client sends", async () => {
			const result = await write({
				...ad,
				kind: "product",
				priceUnit: "month",
			});
			expect(result).toMatchObject({ kind: "rental", priceUnit: "month" });
		});

		it("refuses a unit the kind does not allow", async () => {
			await expect(write({ ...ad, priceUnit: "hour" })).rejects.toMatchObject({
				name: "ValidationError",
			});
		});

		it("keeps the stored kind on a write that does not touch the ad", async () => {
			const stored = { ...ad, id: "l-1", kind: "rental", priceUnit: "month" };
			const result = await write(
				{ boostedUntil: "2026-11-01T00:00:00.000Z" },
				stored,
			);
			expect(result).toMatchObject({ kind: "rental", priceUnit: "month" });
		});

		it("drops the unit with the price", async () => {
			const stored = { ...ad, id: "l-1", kind: "rental", priceUnit: "month" };
			const result = await write({ price: null }, stored);
			expect(result?.priceUnit).toBeNull();
		});
	});
});
