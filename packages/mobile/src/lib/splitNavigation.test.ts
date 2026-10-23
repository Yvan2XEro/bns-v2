import { describe, expect, test } from "bun:test";
import { openAction, SPLIT_PARAM, selectionToPush } from "./splitNavigation";

const orderHref = (id: string) => `/seller/orders/${id}`;

describe("opening an item of a list", () => {
	test("pushes the item's own screen when the window is not split", () => {
		expect(openAction(false, "o-1", orderHref)).toEqual({
			kind: "push",
			href: "/seller/orders/o-1",
		});
	});

	test("selects in place when split, keeping the list where it is", () => {
		expect(openAction(true, "o-1", orderHref)).toEqual({
			kind: "select",
			params: { [SPLIT_PARAM]: "o-1" },
		});
	});

	test("drops the params that belonged to the previous item", () => {
		expect(
			openAction(true, "c-2", (id) => `/messages/${id}`, ["listing", "draft"]),
		).toEqual({
			kind: "select",
			params: { listing: undefined, draft: undefined, [SPLIT_PARAM]: "c-2" },
		});
	});
});

describe("a selection when the window stops being split", () => {
	test("opens as its own screen", () => {
		expect(selectionToPush(false, "o-1")).toBe("o-1");
	});

	test("stays in place while split, and does nothing without one", () => {
		expect(selectionToPush(true, "o-1")).toBeNull();
		expect(selectionToPush(false, null)).toBeNull();
	});
});
