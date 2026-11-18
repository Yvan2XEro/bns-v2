import { z } from "zod";
import {
	normaliseShopReturnPolicy,
	SHOP_RETURN_POLICY_MAX,
	shopReturnPolicyIssue,
} from "../../../api/src/contracts/shopReturnPolicy";

export { SHOP_RETURN_POLICY_MAX };

export const returnPolicyFormSchema = z.object({
	returnPolicy: z
		.string()
		.refine((value) => shopReturnPolicyIssue(value) === null, {
			message: "tooLong",
		}),
});

export type ReturnPolicyFormValues = z.infer<typeof returnPolicyFormSchema>;

export function returnPolicyFormDefaults(
	value: string | null | undefined,
): ReturnPolicyFormValues {
	return { returnPolicy: value ?? "" };
}

/** Blank clears the default, as the server stores it. */
export function toReturnPolicyInput(values: ReturnPolicyFormValues): {
	returnPolicy: string | null;
} {
	return { returnPolicy: normaliseShopReturnPolicy(values.returnPolicy) };
}
