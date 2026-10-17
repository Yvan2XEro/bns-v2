import { describe, expect, test } from "bun:test";
import type { CartLineView, CartView, SplitCartView } from "../types/order";
import { cartItemCount, patchCartLine } from "./cartCount";

const line = (quantity: number) => ({ quantity }) as CartLineView;

describe("cartItemCount", () => {
	test("adds the quantities of a single-shop cart", () => {
		expect(
			cartItemCount({ lines: [line(2), line(1)] } as unknown as CartView),
		).toBe(3);
	});

	test("adds across the groups of a split cart", () => {
		expect(
			cartItemCount({
				groups: [{ items: [line(1)] }, { items: [line(4)] }],
			} as unknown as SplitCartView),
		).toBe(5);
	});

	test("is zero with no cart", () => {
		expect(cartItemCount(undefined)).toBe(0);
	});
});

describe("patchCartLine", () => {
	test("changes one line and drops a group left empty", () => {
		const cart = {
			groups: [
				{ items: [{ id: "a", quantity: 1, unitPrice: 100 }] },
				{ items: [{ id: "b", quantity: 2, unitPrice: 50 }] },
			],
		} as unknown as SplitCartView;
		const removed = patchCartLine(cart, "a", () => null) as SplitCartView;
		expect(removed.groups).toHaveLength(1);
		const bumped = patchCartLine(cart, "b", (line) => ({
			...line,
			quantity: 3,
		})) as SplitCartView;
		expect(bumped.groups[1]?.items[0]?.quantity).toBe(3);
	});
});
