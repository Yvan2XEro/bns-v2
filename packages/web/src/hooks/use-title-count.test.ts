import { describe, expect, test } from "bun:test";
import { withTitleCount } from "./use-title-count";

describe("withTitleCount", () => {
	test("puts the count in front, once", () => {
		expect(withTitleCount("Commandes", 2)).toBe("(2) Commandes");
		expect(withTitleCount("(2) Commandes", 3)).toBe("(3) Commandes");
	});

	test("drops it when nothing is waiting", () => {
		expect(withTitleCount("(5) Commandes", 0)).toBe("Commandes");
	});

	test("caps it", () => {
		expect(withTitleCount("Commandes", 150)).toBe("(99+) Commandes");
		expect(withTitleCount("(99+) Commandes", 1)).toBe("(1) Commandes");
	});
});
