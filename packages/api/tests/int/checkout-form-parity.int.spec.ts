// @vitest-environment node
import { describe, expect, it } from "vitest";

// Two parity suites share this file on purpose: everything the two
// clients validate before the same route lives here, so a drift in either
// copy fails one place.

import {
	type CheckoutAddressValues,
	DISTRICTS as mobileDistricts,
	CHECKOUT_PHONE_PATTERN as mobilePhonePattern,
	checkoutAddressSchema as mobileSchema,
	toAddressInput as mobileToAddressInput,
} from "../../../mobile/src/lib/checkoutForm";
import {
	DISTRICTS as webDistricts,
	CHECKOUT_PHONE_PATTERN as webPhonePattern,
	checkoutAddressSchema as webSchema,
	toAddressInput as webToAddressInput,
} from "../../../web/src/lib/checkout-form";
import { LAUNCH_CITY_KEYS } from "../../src/lib/launchCities";
import { ServiceError } from "../../src/lib/serviceError";
import { parseDeliveryAddress } from "../../src/services/checkout";

/**
 * The checkout address rules exist three times: `parseDeliveryAddress` on the
 * server, and one zod copy in each client so a buyer sees the refusal on the
 * field before a round trip. Each client's own test pins its copy against
 * fixed expectations; neither can notice the other drifting. This file runs
 * all three over one table — every row a single defect at a boundary, or
 * none — and requires the same verdict on the same field from each.
 */
type Method = "seller_delivery" | "pickup";

const valid: CheckoutAddressValues = {
	recipientName: "Awa Ngono",
	phone: "+237699124408",
	city: "douala",
	district: "douala.akwa",
	districtOther: "",
	landmark: "En face de la pharmacie du Rond-point",
	instructions: "",
};

const CASES: Array<{
	name: string;
	values: Partial<CheckoutAddressValues>;
	method?: Method;
	/**
	 * The one known difference: the server's `CAMEROON_PHONE` takes any
	 * `+237` nine-digit number, the clients only a `+2376` mobile, because
	 * the confirmation SMS goes to this number. Stricter on the client is the
	 * safe direction; this row pins it so either side moving is noticed.
	 */
	serverAccepts?: true;
}> = [
	{ name: "a complete address", values: {} },
	{ name: "a complete pickup address", values: {}, method: "pickup" },
	{ name: "recipient of 2", values: { recipientName: "Al" } },
	{ name: "recipient of 1", values: { recipientName: "A" } },
	{ name: "recipient of 60", values: { recipientName: "A".repeat(60) } },
	{ name: "recipient of 61", values: { recipientName: "A".repeat(61) } },
	{ name: "recipient of spaces", values: { recipientName: "   " } },
	{
		name: "a landline",
		values: { phone: "+237222123456" },
		serverAccepts: true,
	},
	{ name: "a short mobile", values: { phone: "+23769912440" } },
	{ name: "a foreign mobile", values: { phone: "+33612345678" } },
	{
		name: "another launch city",
		values: { city: "yaounde", district: "yaounde.bastos" },
	},
	{
		name: "an unknown city",
		values: {
			city: "bafoussam",
			district: "bafoussam.other",
			districtOther: "Tamdja",
		},
	},
	{ name: "another city's district", values: { district: "yaounde.bastos" } },
	{ name: "no district", values: { district: "" } },
	{ name: "an invented district", values: { district: "douala.nowhere" } },
	{
		name: ".other with its text",
		values: { district: "douala.other", districtOther: "Ndogbong" },
	},
	{
		name: ".other with 1 character",
		values: { district: "douala.other", districtOther: "N" },
	},
	{
		name: ".other with 61 characters",
		values: { district: "douala.other", districtOther: "N".repeat(61) },
	},
	{
		name: ".other blank",
		values: { district: "douala.other", districtOther: "  " },
	},
	{ name: "no landmark, delivery", values: { landmark: "" } },
	{ name: "no landmark, pickup", values: { landmark: "" }, method: "pickup" },
	{
		name: "blank landmark, pickup",
		values: { landmark: "   " },
		method: "pickup",
	},
	{ name: "landmark of 4, delivery", values: { landmark: "abcd" } },
	{
		name: "landmark of 4, pickup",
		values: { landmark: "abcd" },
		method: "pickup",
	},
	{ name: "landmark of 5, delivery", values: { landmark: "abcde" } },
	{
		name: "landmark of 5, pickup",
		values: { landmark: "abcde" },
		method: "pickup",
	},
	{ name: "landmark of 200", values: { landmark: "a".repeat(200) } },
	{ name: "landmark of 201, delivery", values: { landmark: "a".repeat(201) } },
	{
		name: "landmark of 201, pickup",
		values: { landmark: "a".repeat(201) },
		method: "pickup",
	},
	{ name: "padded landmark of 5", values: { landmark: "  abcde  " } },
	{ name: "instructions of 300", values: { instructions: "a".repeat(300) } },
	{ name: "instructions of 301", values: { instructions: "a".repeat(301) } },
];

function clientFields(
	schema: typeof webSchema | typeof mobileSchema,
	values: CheckoutAddressValues,
	method: Method,
): string[] {
	const result = schema(LAUNCH_CITY_KEYS, method).safeParse(values);
	return result.success ? [] : result.error.issues.map((i) => i.path.join("."));
}

function serverField(
	values: CheckoutAddressValues,
	method: Method,
): string | null {
	try {
		parseDeliveryAddress(webToAddressInput(values), method);
		return null;
	} catch (error) {
		const field =
			error instanceof ServiceError ? error.details?.field : undefined;
		if (typeof field !== "string") throw error;
		return field.replace(/^delivery\./, "");
	}
}

describe("the checkout address rules agree across the API and both clients", () => {
	for (const {
		name,
		values,
		method = "seller_delivery",
		serverAccepts,
	} of CASES) {
		it(name, () => {
			const input = { ...valid, ...values };
			const web = clientFields(webSchema, input, method);
			const mobile = clientFields(mobileSchema, input, method);
			expect(mobile).toEqual(web);
			expect(web.length).toBeLessThanOrEqual(1);
			expect(serverAccepts ? null : (web[0] ?? null)).toBe(
				serverField(input, method),
			);
		});
	}

	it("the table exercises every field the server can refuse", () => {
		const refused = new Set(
			CASES.map(({ values, method = "seller_delivery" }) =>
				serverField({ ...valid, ...values }, method),
			).filter((field): field is string => field !== null),
		);
		expect([...refused].sort()).toEqual(
			[
				"city",
				"district",
				"districtOther",
				"instructions",
				"landmark",
				"phone",
				"recipientName",
			].sort(),
		);
	});
});

describe("the values around the rules agree too", () => {
	it("the phone pattern is one pattern", () => {
		expect(mobilePhonePattern.source).toBe(webPhonePattern.source);
	});

	it("the district tables are one table", () => {
		expect(mobileDistricts).toEqual(webDistricts);
	});

	it("the form values become the same AddressInput", () => {
		const values: CheckoutAddressValues = {
			...valid,
			recipientName: "  Awa Ngono ",
			district: "douala.other",
			districtOther: " Ndogbong ",
			landmark: " Carrefour ",
			instructions: " Appeler avant ",
			gps: { lat: 4.05, lng: 9.7, accuracyMeters: 12 },
		};
		expect(mobileToAddressInput(values)).toEqual(webToAddressInput(values));
		expect(mobileToAddressInput(valid)).toEqual(webToAddressInput(valid));
	});
});

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
