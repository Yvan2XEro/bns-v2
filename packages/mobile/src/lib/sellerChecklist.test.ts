import { describe, expect, test } from "bun:test";
import { buildChecklistSteps, countDoneSteps } from "./sellerChecklist";

describe("buildChecklistSteps", () => {
	test("on a brand new shop, only logo/product/share are offered, none done", () => {
		const steps = buildChecklistSteps({
			hasLogo: false,
			productCount: 0,
			personalListings: 0,
		});
		expect(steps.map((s) => s.key)).toEqual(["logo", "product", "share"]);
		expect(steps.every((s) => !s.done)).toBe(true);
	});

	test("inserts the move-listings step between product and share when the owner has personal listings", () => {
		const steps = buildChecklistSteps({
			hasLogo: false,
			productCount: 0,
			personalListings: 3,
		});
		expect(steps.map((s) => s.key)).toEqual([
			"logo",
			"product",
			"move",
			"share",
		]);
	});

	test("marks logo and product done once they are set, move and share never auto-complete", () => {
		const steps = buildChecklistSteps({
			hasLogo: true,
			productCount: 2,
			personalListings: 1,
		});
		expect(steps).toEqual([
			{ key: "logo", done: true },
			{ key: "product", done: true },
			{ key: "move", done: false },
			{ key: "share", done: false },
		]);
	});
});

describe("countDoneSteps", () => {
	test("counts only the done steps", () => {
		const steps = buildChecklistSteps({
			hasLogo: true,
			productCount: 0,
			personalListings: 0,
		});
		expect(countDoneSteps(steps)).toBe(1);
	});
});
