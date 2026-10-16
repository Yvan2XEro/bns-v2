import { describe, expect, it } from "bun:test";
import {
	returnPolicyFormSchema,
	SHOP_RETURN_POLICY_MAX,
	toReturnPolicyInput,
} from "./shop-return-policy";

describe("shop return policy form", () => {
	it("accepts up to the product field's limit, trimmed", () => {
		const atLimit = `  ${"x".repeat(SHOP_RETURN_POLICY_MAX)}  `;
		expect(
			returnPolicyFormSchema.safeParse({ returnPolicy: atLimit }).success,
		).toBe(true);
		expect(
			returnPolicyFormSchema.safeParse({
				returnPolicy: "x".repeat(SHOP_RETURN_POLICY_MAX + 1),
			}).success,
		).toBe(false);
	});

	it("sends a blank policy as a cleared default", () => {
		expect(toReturnPolicyInput({ returnPolicy: "   " })).toEqual({
			returnPolicy: null,
		});
		expect(toReturnPolicyInput({ returnPolicy: " Retour 7 jours " })).toEqual({
			returnPolicy: "Retour 7 jours",
		});
	});
});
