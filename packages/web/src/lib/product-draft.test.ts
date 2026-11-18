import { describe, expect, test } from "bun:test";
import { restoreDraft } from "./product-draft";
import { emptyState } from "./product-form";

describe("restoreDraft", () => {
	test("keeps the typed fields and never brings files back", () => {
		const draft = restoreDraft({
			savedAt: "2026-10-15T10:42:00.000Z",
			state: {
				...emptyState(),
				title: "Galaxy S24",
				categoryId: "c-1",
				newImages: [{ id: "x" }],
			},
		});
		expect(draft?.savedAt).toBe("2026-10-15T10:42:00.000Z");
		expect(draft?.state.title).toBe("Galaxy S24");
		expect(draft?.state.categoryId).toBe("c-1");
		expect(draft?.state).not.toHaveProperty("newImages");
	});

	test("falls back field by field when a stored value has the wrong shape", () => {
		const draft = restoreDraft({
			savedAt: "2026-10-15T10:42:00.000Z",
			state: { title: 42, variants: "nope", codAllowed: false },
		});
		expect(draft?.state.title).toBe("");
		expect(draft?.state.variants).toEqual(emptyState().variants);
		expect(draft?.state.codAllowed).toBe(false);
	});

	test("rejects anything that is not a draft", () => {
		expect(restoreDraft(null)).toBeNull();
		expect(restoreDraft({ state: {} })).toBeNull();
	});
});
