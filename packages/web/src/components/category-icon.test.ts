import { describe, expect, test } from "bun:test";
import taxonomy from "../../../api/src/seed/taxonomy/categories.json";
import { CATEGORY_ICON_NAMES } from "./category-icon";

describe("category icons", () => {
	test("the site draws every icon the taxonomy extension names", () => {
		const known = new Set(CATEGORY_ICON_NAMES);
		const missing = [
			...new Set(
				(taxonomy as { icon?: string }[])
					.map((category) => category.icon)
					.filter(
						(icon): icon is string =>
							Boolean(icon) && !known.has(icon as string),
					),
			),
		];
		expect(missing).toEqual([]);
	});
});
