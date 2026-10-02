// @vitest-environment node
import { describe, expect, it } from "vitest";
import {
	orderSettingsSchema as mobileOrderSettingsSchema,
	toOrderSettingsInput as mobileToOrderSettingsInput,
	type OrderSettingsFormValues,
} from "../../../mobile/src/lib/orderSettingsForm";
import {
	orderSettingsSchema as webOrderSettingsSchema,
	toOrderSettingsInput as webToOrderSettingsInput,
} from "../../../web/src/lib/order-settings-form";

/**
 * The shop's order-settings form is validated twice — web's
 * `order-settings-form.ts` and mobile's `orderSettingsForm.ts` — before the
 * same `PATCH /api/shops/{id}/order-settings`. A seller must not find a fee
 * the app refuses and the site accepts, so both schemas run over one table
 * and must report the same issues (path and code) on every row, and turn the
 * same accepted values into the same request body.
 */
const base: OrderSettingsFormValues = {
	codEnabled: true,
	sellerDeliveryEnabled: true,
	deliveryFee: "",
	deliveryEtaText: "",
	pickupEnabled: false,
	pickupAddress: "",
	pickupLandmark: "",
	pickupHours: "",
	salesTermsExtra: "",
};

const ROWS: Array<[string, Partial<OrderSettingsFormValues>]> = [
	["defaults", {}],
	["fee 0", { deliveryFee: "0" }],
	["fee at the ceiling", { deliveryFee: "20000" }],
	["fee above the ceiling", { deliveryFee: "20001" }],
	["negative fee", { deliveryFee: "-1" }],
	["decimal fee", { deliveryFee: "1500.5" }],
	["text fee", { deliveryFee: "abc" }],
	["padded fee", { deliveryFee: " 2500 " }],
	["eta at 60", { deliveryEtaText: "a".repeat(60) }],
	["eta at 61", { deliveryEtaText: "a".repeat(61) }],
	["pickup with a blank address", { pickupEnabled: true, pickupAddress: "  " }],
	["pickup with an address", { pickupEnabled: true, pickupAddress: "Akwa" }],
	["pickup landmark at 201", { pickupLandmark: "l".repeat(201) }],
	["pickup hours at 201", { pickupHours: "h".repeat(201) }],
	["terms at 2000", { salesTermsExtra: "x".repeat(2000) }],
	["terms at 2001", { salesTermsExtra: "x".repeat(2001) }],
	[
		"several faults",
		{
			deliveryFee: "99999",
			pickupEnabled: true,
			pickupAddress: "",
			salesTermsExtra: "x".repeat(2001),
		},
	],
];

type Schema = typeof webOrderSettingsSchema | typeof mobileOrderSettingsSchema;

function issues(schema: Schema, input: OrderSettingsFormValues) {
	const parsed = schema.safeParse(input);
	return parsed.success
		? []
		: parsed.error.issues.map((issue) => [issue.path.join("."), issue.message]);
}

describe("order settings form: mobile and web validate alike", () => {
	for (const [name, patch] of ROWS) {
		it(`reports the same issues for: ${name}`, () => {
			const input = { ...base, ...patch };
			expect(issues(mobileOrderSettingsSchema, input)).toEqual(
				issues(webOrderSettingsSchema, input),
			);
		});
	}

	it("the table exercises both outcomes", () => {
		const outcomes = ROWS.map(
			([, patch]) =>
				webOrderSettingsSchema.safeParse({ ...base, ...patch }).success,
		);
		expect(outcomes.filter(Boolean).length).toBe(7);
		expect(outcomes.filter((ok) => !ok).length).toBe(10);
	});

	it("turns the same values into the same request body", () => {
		const values: OrderSettingsFormValues = {
			...base,
			codEnabled: false,
			deliveryFee: " 2000 ",
			deliveryEtaText: "  sous 48 h ",
			pickupEnabled: true,
			pickupAddress: " Akwa ",
		};
		expect(mobileToOrderSettingsInput(values)).toEqual(
			webToOrderSettingsInput(values),
		);
	});
});
