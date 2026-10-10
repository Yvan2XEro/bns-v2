// @vitest-environment node
import { describe, expect, it } from "vitest";

// Two parity suites share this file on purpose: everything the two
// clients validate before the same route lives here, so a drift in either
// copy fails one place.

import {
	type CheckoutAddressValues,
	DISTRICTS as mobileDistricts,
	checkoutAddressSchema as mobileSchema,
	toAddressInput as mobileToAddressInput,
} from "../../../mobile/src/lib/checkoutForm";
import { setMarket } from "../../../mobile/src/lib/market";
import {
	DISTRICTS as webDistricts,
	checkoutAddressSchema as webSchema,
	toAddressInput as webToAddressInput,
} from "../../../web/src/lib/checkout-form";
import { LAUNCH_CITY_KEYS } from "../../src/lib/launchCities";
import { ServiceError } from "../../src/lib/serviceError";
import { parseDeliveryAddress } from "../../src/services/checkout";
import { cmRow, served, servedConfig } from "./helpers/servedMarket";

/**
 * The checkout address rules exist three times: `parseDeliveryAddress` on the
 * server, and one zod copy in each client so a buyer sees the refusal on the
 * field before a round trip. Each client's own test pins its copy against
 * fixed expectations; neither can notice the other drifting. This file runs
 * all three over one table — every row a single defect at a boundary, or
 * none — and requires the same verdict on the same field from each.
 */
type Method = "seller_delivery" | "pickup" | "courier";

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
}> = [
	{ name: "a complete address", values: {} },
	{ name: "a complete pickup address", values: {}, method: "pickup" },
	{ name: "recipient of 2", values: { recipientName: "Al" } },
	{ name: "recipient of 1", values: { recipientName: "A" } },
	{ name: "recipient of 60", values: { recipientName: "A".repeat(60) } },
	{ name: "recipient of 61", values: { recipientName: "A".repeat(61) } },
	{ name: "recipient of spaces", values: { recipientName: "   " } },
	// The confirmation and handover codes travel by SMS to this number, so a
	// landline is refused everywhere, the server included.
	{ name: "a landline", values: { phone: "+237222123456" } },
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
	{ name: "no landmark, courier", values: { landmark: "" }, method: "courier" },
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

/**
 * P10 (Task 23): the phone rule is served data. The row below is the CM
 * market as the migration seeds it; the api's `marketOf` normalises it, the
 * result is what the config route serves, and both clients are built from
 * THAT — web takes the compiled pattern as a builder argument, mobile reads
 * its market store. Nothing in either client names the rule.
 */
const servedPattern = (row = cmRow()) => served(row).phone.pattern;
setMarket(servedConfig(cmRow()));

function issuesOf(
	schema: ReturnType<typeof webSchema> | ReturnType<typeof mobileSchema>,
	values: CheckoutAddressValues,
): string[] {
	const result = schema.safeParse(values);
	return result.success ? [] : result.error.issues.map((i) => i.path.join("."));
}

function clientFields(
	client: "web" | "mobile",
	values: CheckoutAddressValues,
	method: Method,
): string[] {
	return client === "web"
		? issuesOf(
				webSchema(LAUNCH_CITY_KEYS, method, new RegExp(servedPattern())),
				values,
			)
		: issuesOf(mobileSchema(LAUNCH_CITY_KEYS, method), values);
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
	for (const { name, values, method = "seller_delivery" } of CASES) {
		it(name, () => {
			const input = { ...valid, ...values };
			const web = clientFields("web", input, method);
			const mobile = clientFields("mobile", input, method);
			expect(mobile).toEqual(web);
			expect(web.length).toBeLessThanOrEqual(1);
			expect(web[0] ?? null).toBe(serverField(input, method));
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
	it("the phone rule is data: mutate the served pattern and the row and both clients flip together", () => {
		// The server's own enforcement is still the DELIVERY_PHONE_PATTERN
		// constant (pinned against the row in the next test), so it cannot flip.
		const base = { ...valid, phone: "+237699124408" };
		const mutatedRow = cmRow({
			phone: { pattern: "^\\+2377\\d{8}$", displayExample: "+237 7XX" },
		});
		const other = { ...valid, phone: "+237799124408" };
		const verdicts = (row: ReturnType<typeof cmRow>, input: typeof valid) => {
			setMarket(servedConfig(row));
			const pattern = new RegExp(servedPattern(row));
			return {
				row: pattern.test(input.phone),
				web: issuesOf(
					webSchema(LAUNCH_CITY_KEYS, "seller_delivery", pattern),
					input,
				).includes("phone"),
				mobile: issuesOf(
					mobileSchema(LAUNCH_CITY_KEYS, "seller_delivery"),
					input,
				).includes("phone"),
			};
		};
		try {
			// Seeded row: the 6-prefixed mobile passes, the 7-prefixed one fails.
			expect(verdicts(cmRow(), base)).toEqual({
				row: true,
				web: false,
				mobile: false,
			});
			expect(verdicts(cmRow(), other)).toEqual({
				row: false,
				web: true,
				mobile: true,
			});
			// Mutated row: both verdicts invert on all sides at once.
			expect(verdicts(mutatedRow, base)).toEqual({
				row: false,
				web: true,
				mobile: true,
			});
			expect(verdicts(mutatedRow, other)).toEqual({
				row: true,
				web: false,
				mobile: false,
			});
		} finally {
			setMarket(servedConfig(cmRow()));
		}
	});

	it("the seeded row's pattern is the one the server enforces, on the row's own examples", () => {
		const row = new RegExp(servedPattern());
		for (const [phone, ok] of [
			["+237650000001", true],
			["+2371650000001", false],
			["+23765000000", false],
			["+237222123456", false],
		] as const) {
			expect(row.test(phone)).toBe(ok);
			const refused = (() => {
				try {
					parseDeliveryAddress(
						webToAddressInput({ ...valid, phone }),
						"seller_delivery",
					);
					return false;
				} catch {
					return true;
				}
			})();
			expect(refused).toBe(!ok);
		}
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
