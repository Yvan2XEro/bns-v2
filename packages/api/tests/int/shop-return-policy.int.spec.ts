// @vitest-environment node
import { describe, expect, it } from "vitest";
import { Shops } from "../../src/collections/Shops";
import { PRODUCT_LIMITS } from "../../src/contracts/productValidation";
import {
	normaliseShopReturnPolicy,
	SHOP_RETURN_POLICY_MAX,
	shopReturnPolicyIssue,
} from "../../src/contracts/shopReturnPolicy";
import { shopOrderMentions } from "../../src/services/orders/queries";

type HookArgs = { value: unknown };
type TextField = {
	name: string;
	type: string;
	maxLength?: number;
	hooks?: { beforeValidate?: ((args: HookArgs) => unknown)[] };
};

const field = Shops.fields.find(
	(candidate) => "name" in candidate && candidate.name === "returnPolicy",
) as TextField | undefined;

describe("the shop's default return policy", () => {
	it("is never longer than a product's own policy", () => {
		expect(SHOP_RETURN_POLICY_MAX).toBe(PRODUCT_LIMITS.returnPolicyMax);
		expect(field?.type).toBe("textarea");
		expect(field?.maxLength).toBe(SHOP_RETURN_POLICY_MAX);
	});

	it("is stored trimmed, a blank one cleared, as the form sends it", () => {
		const hook = field?.hooks?.beforeValidate?.[0];
		expect(hook?.({ value: "  Retour 7 jours " })).toBe("Retour 7 jours");
		expect(hook?.({ value: "   " })).toBeNull();
		expect(hook?.({ value: undefined })).toBeUndefined();
		expect(normaliseShopReturnPolicy(null)).toBeNull();
	});

	it("measures the trimmed text against the limit, on both sides", () => {
		const atLimit = ` ${"x".repeat(SHOP_RETURN_POLICY_MAX)} `;
		expect(shopReturnPolicyIssue(atLimit)).toBeNull();
		expect(shopReturnPolicyIssue("x".repeat(SHOP_RETURN_POLICY_MAX + 1))).toBe(
			"tooLong",
		);
	});
});

describe("shopOrderMentions", () => {
	it("reads the two switches, never an amount", () => {
		expect(
			shopOrderMentions({
				orderSettings: {
					codEnabled: true,
					sellerDeliveryEnabled: false,
					deliveryFee: 2000,
				},
			}),
		).toEqual({ codEnabled: true, sellerDeliveryEnabled: false });
		expect(shopOrderMentions(undefined)).toEqual({
			codEnabled: false,
			sellerDeliveryEnabled: false,
		});
	});
});
