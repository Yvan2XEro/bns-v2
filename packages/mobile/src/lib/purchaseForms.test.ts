import { describe, expect, test } from "bun:test";
import en from "../locales/en.json";
import fr from "../locales/fr.json";
import {
	BUYER_CANCEL_REASONS,
	cancelSchema,
	confirmCodeSchema,
	reviewSchema,
	withdrawalDefaults,
	withdrawalPayload,
	withdrawalSchema,
} from "./purchaseForms";

type Json = { [key: string]: Json | string };

function inBothLocales(key: string): boolean {
	const read = (locale: Json) =>
		key
			.split(".")
			.reduce<Json | string | undefined>(
				(node, part) =>
					node && typeof node === "object" ? node[part] : undefined,
				locale,
			);
	return (
		typeof read(en as Json) === "string" && typeof read(fr as Json) === "string"
	);
}

describe("the buyer's cancel reasons", () => {
	test("offers exactly the two values the API stores", () => {
		expect(BUYER_CANCEL_REASONS.map((r) => r.value)).toEqual([
			"buyer_changed_mind",
			"buyer_ordered_by_mistake",
		]);
	});

	test("labels each with a key present in both locales", () => {
		const keys = BUYER_CANCEL_REASONS.map((r) => r.labelKey);
		expect(keys.filter(inBothLocales)).toEqual(keys);
	});

	test("refuses a missing or invented reason, with a translated message", () => {
		const missing = cancelSchema.safeParse({});
		expect(missing.success).toBe(false);
		expect(missing.error?.issues[0]?.message).toBe(
			"purchases.cancelReasonRequired",
		);
		expect(inBothLocales("purchases.cancelReasonRequired")).toBe(true);
		expect(cancelSchema.safeParse({ reason: "buyer_other" }).success).toBe(
			false,
		);
		expect(
			cancelSchema.safeParse({ reason: "buyer_changed_mind" }).data,
		).toEqual({ reason: "buyer_changed_mind" });
	});
});

describe("the withdrawal form", () => {
	const items = [
		{ id: "i-1", quantity: 2 },
		{ id: "i-2", quantity: 1 },
	];

	test("starts with every line at zero, capped at what was bought", () => {
		expect(withdrawalDefaults(items)).toEqual({
			items: [
				{ orderItemId: "i-1", quantity: 0, max: 2 },
				{ orderItemId: "i-2", quantity: 0, max: 1 },
			],
			reasonText: "",
		});
	});

	test("sends only the lines with a quantity", () => {
		const values = withdrawalDefaults(items);
		values.items[1] = { orderItemId: "i-2", quantity: 1, max: 1 };
		const parsed = withdrawalSchema.parse(values);
		expect(withdrawalPayload(parsed)).toEqual({
			items: [{ orderItemId: "i-2", quantity: 1 }],
			reasonText: null,
		});
	});

	test("refuses a request that returns nothing, with a translated message", () => {
		const result = withdrawalSchema.safeParse(withdrawalDefaults(items));
		expect(result.success).toBe(false);
		expect(result.error?.issues[0]?.message).toBe(
			"purchases.withdrawalNothingSelected",
		);
		expect(inBothLocales("purchases.withdrawalNothingSelected")).toBe(true);
	});

	test("refuses more than the line holds", () => {
		const over = {
			items: [{ orderItemId: "i-2", quantity: 2, max: 1 }],
			reasonText: "",
		};
		expect(withdrawalSchema.safeParse(over).success).toBe(false);
	});
});

describe("the small forms", () => {
	test("accepts a six-digit confirmation code and nothing else", () => {
		expect(confirmCodeSchema.safeParse({ code: "123456" }).success).toBe(true);
		expect(confirmCodeSchema.safeParse({ code: "12345" }).success).toBe(false);
		expect(confirmCodeSchema.safeParse({ code: "12345a" }).success).toBe(false);
	});

	test("rates a shop from one to five", () => {
		expect(reviewSchema.safeParse({ rating: 0, comment: "" }).success).toBe(
			false,
		);
		expect(reviewSchema.parse({ rating: 5, comment: " Top " })).toEqual({
			rating: 5,
			comment: "Top",
		});
	});
});
