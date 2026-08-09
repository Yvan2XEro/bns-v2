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
});
