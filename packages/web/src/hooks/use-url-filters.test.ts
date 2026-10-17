import { describe, expect, test } from "bun:test";
import { readUrlFilters, urlFilterSearch } from "./use-url-filters";

const defaults = { tab: "to_accept", q: "", page: "1" };

describe("url filters", () => {
	test("reads what the URL carries, defaults for the rest", () => {
		expect(
			readUrlFilters(new URLSearchParams("tab=to_ship&other=x"), defaults),
		).toEqual({ tab: "to_ship", q: "", page: "1" });
	});

	test("writes only what differs from the defaults, keeping foreign params", () => {
		expect(
			urlFilterSearch(
				"item=order:1&q=old",
				{ tab: "to_accept", q: "Makepe", page: "2" },
				defaults,
			),
		).toBe("item=order%3A1&q=Makepe&page=2");
		expect(urlFilterSearch("q=old", defaults, defaults)).toBe("");
	});
});
