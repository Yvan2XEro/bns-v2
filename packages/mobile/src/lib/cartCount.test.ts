import { describe, expect, test } from "bun:test";
import type { CartLineView, CartView, SplitCartView } from "../types/order";
import { cartItemCount } from "./cartCount";

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
