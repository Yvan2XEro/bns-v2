import { describe, expect, test } from "bun:test";
import type { OrderSettingsView } from "~/types/order";
import {
	capsNotice,
	type OrderSettingsFormValues,
	orderSettingsSchema,
	toFormValues,
	toOrderSettingsInput,
} from "./order-settings-form";

const values = (
	over: Partial<OrderSettingsFormValues> = {},
): OrderSettingsFormValues => ({
	codEnabled: true,
	sellerDeliveryEnabled: true,
	deliveryFee: "",
	deliveryEtaText: "",
	pickupEnabled: false,
	pickupAddress: "",
	pickupLandmark: "",
	pickupHours: "",
	salesTermsExtra: "",
	...over,
});

const view = (over: Partial<OrderSettingsView> = {}): OrderSettingsView => ({
	codEnabled: true,
	sellerDeliveryEnabled: true,
	deliveryFee: null,
	deliveryEtaText: null,
	pickupEnabled: false,
	pickupPoint: null,
	salesTermsExtra: null,
	caps: null,
	cityDefaultFee: 1500,
	...over,
});

const issuesAt = (input: OrderSettingsFormValues) => {
	const parsed = orderSettingsSchema.safeParse(input);
	return parsed.success
		? []
		: parsed.error.issues.map((issue) => [issue.path.join("."), issue.message]);
};

describe("orderSettingsSchema", () => {
	test("an empty fee is accepted: it means the city default", () => {
		expect(issuesAt(values({ deliveryFee: "" }))).toEqual([]);
	});

	test("a fee at both bounds is accepted", () => {
		expect(issuesAt(values({ deliveryFee: "0" }))).toEqual([]);
		expect(issuesAt(values({ deliveryFee: "20000" }))).toEqual([]);
	});

	test("a fee above 20 000 is refused on the fee", () => {
		expect(issuesAt(values({ deliveryFee: "20001" }))).toEqual([
			["deliveryFee", "feeInvalid"],
		]);
	});

	test("a negative, decimal or non-numeric fee is refused", () => {
		for (const fee of ["-1", "1500.5", "abc"]) {
			expect(issuesAt(values({ deliveryFee: fee }))).toEqual([
				["deliveryFee", "feeInvalid"],
			]);
		}
	});

	test("a 60-character delivery estimate is accepted, 61 is refused", () => {
		expect(issuesAt(values({ deliveryEtaText: "a".repeat(60) }))).toEqual([]);
		expect(issuesAt(values({ deliveryEtaText: "a".repeat(61) }))).toEqual([
			["deliveryEtaText", "tooLong"],
		]);
	});

	test("pickup on with no address is refused on the address", () => {
		expect(
			issuesAt(values({ pickupEnabled: true, pickupAddress: "   " })),
		).toEqual([["pickupAddress", "required"]]);
	});

	test("pickup on with an address is accepted", () => {
		expect(
			issuesAt(values({ pickupEnabled: true, pickupAddress: "Akwa, rue 12" })),
		).toEqual([]);
	});

	test("pickup off needs no address", () => {
		expect(
			issuesAt(values({ pickupEnabled: false, pickupAddress: "" })),
		).toEqual([]);
	});

	test("sales terms of 2 000 characters are accepted, 2 001 refused", () => {
		expect(issuesAt(values({ salesTermsExtra: "x".repeat(2000) }))).toEqual([]);
		expect(issuesAt(values({ salesTermsExtra: "x".repeat(2001) }))).toEqual([
			["salesTermsExtra", "tooLong"],
		]);
	});

	test("several faults are all reported at once", () => {
		expect(
			issuesAt(
				values({
					deliveryFee: "99999",
					pickupEnabled: true,
					pickupAddress: "",
					salesTermsExtra: "x".repeat(2001),
				}),
			),
		).toEqual([
			["deliveryFee", "feeInvalid"],
			["salesTermsExtra", "tooLong"],
			["pickupAddress", "required"],
		]);
	});
});

describe("toOrderSettingsInput", () => {
	test("an empty fee is sent as null, so the server applies the city default", () => {
		expect(toOrderSettingsInput(values({ deliveryFee: " " })).deliveryFee).toBe(
			null,
		);
	});

	test("filled fields are sent trimmed, numbers as numbers, blanks as null", () => {
		expect(
			toOrderSettingsInput(
				values({
					codEnabled: false,
					deliveryFee: "2000",
					deliveryEtaText: "  sous 48 h ",
					pickupEnabled: true,
					pickupAddress: " Akwa ",
					pickupHours: "",
					salesTermsExtra: "",
				}),
			),
		).toEqual({
			codEnabled: false,
			sellerDeliveryEnabled: true,
			deliveryFee: 2000,
			deliveryEtaText: "sous 48 h",
			pickupEnabled: true,
			pickupPoint: { address: "Akwa", landmark: null, hours: null },
			salesTermsExtra: null,
		});
	});
});

describe("toFormValues", () => {
	test("round-trips the server's view into the form's strings", () => {
		expect(
			toFormValues(
				view({
					deliveryFee: 2500,
					deliveryEtaText: "48 h",
					pickupEnabled: true,
					pickupPoint: {
						address: "Bonapriso",
						landmark: null,
						gps: { lat: 4.03, lng: 9.7 },
						hours: "9h-18h",
					},
				}),
			),
		).toEqual(
			values({
				deliveryFee: "2500",
				deliveryEtaText: "48 h",
				pickupEnabled: true,
				pickupAddress: "Bonapriso",
				pickupHours: "9h-18h",
			}),
		);
	});
});

describe("capsNotice", () => {
	test("renders the server's caps, and computes none", () => {
		// Figures no level table holds: only a value read off the view can match.
		const caps = {
			maxOrderTotal: 123_457,
			maxDailyOrders: 7,
			maxOpenOrders: 13,
		};
		expect(capsNotice(view({ caps }))).toEqual(caps);
		expect(capsNotice(view({ caps: null }))).toBe(null);
	});
});
