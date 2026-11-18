import { describe, expect, test } from "bun:test";
import {
	amountAfterTypeChange,
	availableDelta,
	emptyMovementForm,
	historyFiltersOf,
	historySearch,
	type MovementFormState,
	movementFormSchema,
	receiptLines,
} from "./stock";

describe("availableDelta", () => {
	test("a reservation takes a unit away from what buyers can order", () => {
		expect(availableDelta({ type: "reservation", quantity: 1 })).toBe(-1);
		expect(availableDelta({ type: "release", quantity: -1 })).toBe(1);
	});
	test("every other movement keeps its own sign", () => {
		expect(availableDelta({ type: "receipt", quantity: 5 })).toBe(5);
		expect(availableDelta({ type: "loss", quantity: -2 })).toBe(-2);
	});
});

describe("movementFormSchema", () => {
	const levels = { stockOnHand: 10, stockReserved: 3 };
	const issues = (values: Partial<MovementFormState>) => {
		const result = movementFormSchema(levels).safeParse({
			...emptyMovementForm,
			...values,
		});
		return result.success ? [] : result.error.issues.map((i) => i.message);
	};

	test("takes no more than what orders do not hold", () => {
		expect(issues({ type: "loss", amount: "7" })).toEqual([]);
		expect(issues({ type: "loss", amount: "8" })).toEqual(["belowReserved"]);
		expect(issues({ type: "adjustment", amount: "2" })).toEqual([
			"belowReserved",
		]);
		expect(issues({ type: "loss", amount: "11" })).toEqual(["negative"]);
	});

	test("adds freely, and refuses a correction that changes nothing", () => {
		expect(issues({ type: "receipt", amount: "5" })).toEqual([]);
		expect(issues({ type: "adjustment", amount: "10" })).toEqual(["noChange"]);
	});
});

describe("amountAfterTypeChange", () => {
	test("a correction starts from the stock on hand", () => {
		expect(amountAfterTypeChange("receipt", "adjustment", "5", 10)).toBe("10");
	});
	test("leaving a correction empties the field; other switches keep it", () => {
		expect(amountAfterTypeChange("adjustment", "receipt", "10", 10)).toBe("");
		expect(amountAfterTypeChange("receipt", "loss", "5", 10)).toBe("5");
	});
});

describe("the product history's filters", () => {
	const params = (search: string) => new URLSearchParams(search);

	test("are read from the URL, anything unknown falling back", () => {
		expect(
			historyFiltersOf(params("type=loss&variant=v2&page=3"), ["v1", "v2"]),
		).toEqual({
			type: "loss",
			variant: "v2",
			page: 3,
		});
		expect(
			historyFiltersOf(params("type=nope&variant=v9&page=-2"), ["v1"]),
		).toEqual({
			type: "all",
			variant: null,
			page: 1,
		});
	});

	test("are written back without their defaults", () => {
		expect(historySearch({ type: "all", variant: null, page: 1 })).toBe("");
		expect(historySearch({ type: "receipt", variant: "v1", page: 2 })).toBe(
			"?type=receipt&variant=v1&page=2",
		);
	});
});

describe("receiptLines", () => {
	test("keeps the variants that arrived, with their cost when typed", () => {
		expect(
			receiptLines({ v1: "5", v2: "", v3: " 2 " }, { v1: "1500", v3: "" }),
		).toEqual({
			lines: [
				{ variantId: "v1", quantity: 5, unitCost: 1500 },
				{ variantId: "v3", quantity: 2, unitCost: null },
			],
			invalid: [],
		});
	});

	test("names the lines it cannot record", () => {
		expect(
			receiptLines({ v1: "0", v2: "1.5", v3: "4" }, { v3: "abc" }).invalid,
		).toEqual(["v1", "v2", "v3"]);
	});
});
