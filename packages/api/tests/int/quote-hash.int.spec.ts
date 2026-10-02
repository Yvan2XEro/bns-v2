// @vitest-environment node
import { describe, expect, it } from "vitest";
import { type QuoteHashInput, quoteHash } from "../../src/lib/quoteHash";

const base: QuoteHashInput = {
	lines: [
		{ lineId: "l-1", variantId: "v-1", quantity: 2, unitPrice: 15_000 },
		{ lineId: "l-2", variantId: "v-2", quantity: 1, unitPrice: 15_000 },
	],
	deliveryFee: 2_000,
	method: "seller_delivery",
	city: "douala",
	paymentMethod: "cod",
	termsVersion: "2026-09",
};

describe("quoteHash", () => {
	it("is stable for identical input", () => {
		expect(quoteHash(base)).toBe(
			quoteHash({ ...base, lines: [...base.lines] }),
		);
	});

	it("does not depend on line order, because the cart's order is not the buyer's agreement", () => {
		expect(quoteHash({ ...base, lines: [base.lines[1], base.lines[0]] })).toBe(
			quoteHash(base),
		);
	});

	it.each([
		[
			"a unit price",
			{ lines: [{ ...base.lines[0], unitPrice: 16_000 }, base.lines[1]] },
		],
		[
			"a quantity",
			{ lines: [{ ...base.lines[0], quantity: 3 }, base.lines[1]] },
		],
		["a dropped line", { lines: [base.lines[0]] }],
		["the delivery fee", { deliveryFee: 2_500 }],
		["the method", { method: "pickup" as const }],
		["the city", { city: "yaounde" }],
		["the payment method", { paymentMethod: "mobile_money" as const }],
		["the terms version", { termsVersion: "2026-10" }],
	])("changes when %s changes", (_label, patch) => {
		expect(quoteHash({ ...base, ...patch })).not.toBe(quoteHash(base));
	});

	it("is a hex SHA-256 and carries no readable input", () => {
		const hash = quoteHash(base);
		expect(hash).toMatch(/^[0-9a-f]{64}$/);
		expect(hash).not.toContain("15000");
	});
});
