// @vitest-environment node
import { describe, expect, it } from "vitest";
import * as mobile from "../../../mobile/src/lib/paymentStatus";
import mobileEn from "../../../mobile/src/locales/en.json";
import mobileFr from "../../../mobile/src/locales/fr.json";
import webEn from "../../../web/messages/en.json";
import webFr from "../../../web/messages/fr.json";
import * as web from "../../../web/src/lib/payment-status";
import type { NameMatchVerdict } from "../../src/lib/nameMatch";
import { CHANNEL_PHONE_PREFIXES } from "../../src/lib/paymentMath";
import type {
	ConnectedAccountStatus,
	NormalisedRefundStatus,
	NormalisedTransferStatus,
	PaymentFailureCode,
} from "../../src/lib/payments/marketplace";
import type { PaymentIntent } from "../../src/payload-types";

/**
 * The payments vocabulary is hand-mirrored in both clients, the same split
 * `order-actions-parity.int.spec.ts` makes: each client's own test can only
 * check itself, so this API-side file imports both and holds them to the
 * backend's enums and to each other, cell for cell, with no name map. The
 * one uniform difference is the namespace: mobile calls `t()` without one, so
 * its keys carry `payments.`; web's are relative to `Payments`.
 */

/**
 * `Record<T, true>` makes the compiler hold each list to the API's own union:
 * a value added server-side is a missing property here, a value removed is
 * an excess one — under `check-types:tests`, before any assertion runs.
 */
function keysOf<T extends string>(record: Record<T, true>): string[] {
	return Object.keys(record);
}

const API_INTENT_STATUSES = keysOf<PaymentIntent["status"]>({
	created: true,
	pending: true,
	succeeded: true,
	failed: true,
	cancelled: true,
	expired: true,
});

const API_FAILURE_CODES = keysOf<PaymentFailureCode>({
	declined: true,
	insufficient_funds: true,
	timeout: true,
	limit_exceeded: true,
	invalid_number: true,
	provider_error: true,
});

// The port omits the two statuses no provider can report (see its comments
// in `marketplace.ts`); the `payouts` and `refunds` rows add them back.
const API_PAYOUT_STATUSES = keysOf<
	NormalisedTransferStatus | "scheduled" | "cancelled"
>({
	scheduled: true,
	pending: true,
	sent: true,
	processing: true,
	complete: true,
	failed: true,
	reversed: true,
	cancelled: true,
});

const API_REFUND_STATUSES = keysOf<NormalisedRefundStatus | "created">({
	created: true,
	pending: true,
	processing: true,
	succeeded: true,
	failed: true,
});

const API_CONNECTED_ACCOUNT_STATUSES = keysOf<ConnectedAccountStatus>({
	created: true,
	onboarding: true,
	restricted: true,
	active: true,
	disabled: true,
	deauthorized: true,
});

const API_NAME_MATCH_RESULTS = keysOf<NameMatchVerdict>({
	match: true,
	partial: true,
	mismatch: true,
});

const API_CHANNELS = Object.keys(CHANNEL_PHONE_PREFIXES);

/**
 * Transcribed from the spec's `payout-accounts` and `payout-holds` tables:
 * neither collection exists in the API yet. Once they do, import their
 * option lists here instead.
 */
const SPEC_PAYOUT_ACCOUNT_STATUSES = [
	"pending_verification",
	"pending_review",
	"active",
	"rejected",
	"replaced",
];
const SPEC_PAYOUT_METHODS = ["mtn_momo", "orange_money", "bank"];
const SPEC_HOLD_REASONS: readonly web.PayoutHoldReason[] = [
	"payout_account_changed",
	"fraud_signal",
	"reconciliation_mismatch",
	"dispute_open",
	"return_open",
	"moderation",
	"payout_failed_repeatedly",
	"shop_suspended",
];
const HOLD_CATEGORIES = ["security", "review", "operations"];

type KeyMap = Readonly<Record<string, string>>;

const MAPS: ReadonlyArray<{
	name: string;
	web: KeyMap;
	mobile: KeyMap;
	values: readonly string[];
}> = [
	{
		name: "PAYMENT_INTENT_STATUSES",
		web: web.PAYMENT_INTENT_STATUSES,
		mobile: mobile.PAYMENT_INTENT_STATUSES,
		values: API_INTENT_STATUSES,
	},
	{
		name: "PAYMENT_FAILURE_MESSAGES",
		web: web.PAYMENT_FAILURE_MESSAGES,
		mobile: mobile.PAYMENT_FAILURE_MESSAGES,
		values: API_FAILURE_CODES,
	},
	{
		name: "PAYMENT_CHANNEL_LABELS",
		web: web.PAYMENT_CHANNEL_LABELS,
		mobile: mobile.PAYMENT_CHANNEL_LABELS,
		values: API_CHANNELS,
	},
	{
		name: "PAYMENT_CHANNEL_INSTRUCTIONS",
		web: web.PAYMENT_CHANNEL_INSTRUCTIONS,
		mobile: mobile.PAYMENT_CHANNEL_INSTRUCTIONS,
		values: API_CHANNELS,
	},
	{
		name: "PAYOUT_STATUSES",
		web: web.PAYOUT_STATUSES,
		mobile: mobile.PAYOUT_STATUSES,
		values: API_PAYOUT_STATUSES,
	},
	{
		name: "REFUND_STATUSES",
		web: web.REFUND_STATUSES,
		mobile: mobile.REFUND_STATUSES,
		values: API_REFUND_STATUSES,
	},
	{
		name: "CONNECTED_ACCOUNT_STATUSES",
		web: web.CONNECTED_ACCOUNT_STATUSES,
		mobile: mobile.CONNECTED_ACCOUNT_STATUSES,
		values: API_CONNECTED_ACCOUNT_STATUSES,
	},
	{
		name: "PAYOUT_ACCOUNT_STATUSES",
		web: web.PAYOUT_ACCOUNT_STATUSES,
		mobile: mobile.PAYOUT_ACCOUNT_STATUSES,
		values: SPEC_PAYOUT_ACCOUNT_STATUSES,
	},
	{
		name: "PAYOUT_METHODS",
		web: web.PAYOUT_METHODS,
		mobile: mobile.PAYOUT_METHODS,
		values: SPEC_PAYOUT_METHODS,
	},
	{
		name: "NAME_MATCH_RESULTS",
		web: web.NAME_MATCH_RESULTS,
		mobile: mobile.NAME_MATCH_RESULTS,
		values: API_NAME_MATCH_RESULTS,
	},
	{
		name: "HOLD_CATEGORY_LABELS",
		web: web.HOLD_CATEGORY_LABELS,
		mobile: mobile.HOLD_CATEGORY_LABELS,
		values: HOLD_CATEGORIES,
	},
	{
		name: "HOLD_CATEGORY_DESCRIPTIONS",
		web: web.HOLD_CATEGORY_DESCRIPTIONS,
		mobile: mobile.HOLD_CATEGORY_DESCRIPTIONS,
		values: HOLD_CATEGORIES,
	},
];

const MOBILE_PREFIX = "payments.";

/** Every cell where the two clients disagree, named, so a failure says which. */
function divergentCells(webMap: KeyMap, mobileMap: KeyMap): string[] {
	const values = new Set([...Object.keys(webMap), ...Object.keys(mobileMap)]);
	return [...values]
		.filter((value) => mobileMap[value] !== `${MOBILE_PREFIX}${webMap[value]}`)
		.map(
			(value) =>
				`${value}: web ${String(webMap[value])}, mobile ${String(mobileMap[value])}`,
		)
		.sort();
}

const webNs: Record<"en" | "fr", Record<string, string>> = {
	en: webEn.Payments,
	fr: webFr.Payments,
};
const mobileNs: Record<"en" | "fr", Record<string, string>> = {
	en: mobileEn.payments,
	fr: mobileFr.payments,
};

describe("each client's payments vocabulary covers the backend's enums", () => {
	for (const { name, web: webMap, mobile: mobileMap, values } of MAPS) {
		it(`${name} labels exactly the values the API can send`, () => {
			expect(values.length).toBeGreaterThan(1);
			expect(Object.keys(webMap).sort()).toEqual([...values].sort());
			expect(Object.keys(mobileMap).sort()).toEqual([...values].sort());
		});
	}

	it("categorises exactly the eight hold reasons, in both clients", () => {
		expect(SPEC_HOLD_REASONS).toHaveLength(8);
		expect(Object.keys(web.HOLD_REASON_CATEGORIES).sort()).toEqual(
			[...SPEC_HOLD_REASONS].sort(),
		);
		expect(Object.keys(mobile.HOLD_REASON_CATEGORIES).sort()).toEqual(
			[...SPEC_HOLD_REASONS].sort(),
		);
	});
});

describe("the two clients' payments vocabularies are the same table", () => {
	for (const { name, web: webMap, mobile: mobileMap, values } of MAPS) {
		it(`${name} agrees cell for cell`, () => {
			expect(divergentCells(webMap, mobileMap)).toEqual([]);
			expect(Object.keys(webMap)).toHaveLength(values.length);
		});
	}

	it("holdReasonCategory gives the owner the same category on both clients", () => {
		const webCategories = SPEC_HOLD_REASONS.map(web.holdReasonCategory);
		expect(SPEC_HOLD_REASONS.map(mobile.holdReasonCategory)).toEqual(
			webCategories,
		);
		expect(webCategories).toEqual([
			"security",
			"security",
			"operations",
			"review",
			"review",
			"review",
			"operations",
			"review",
		]);
		expect(mobile.HOLD_REASON_CATEGORIES).toEqual(web.HOLD_REASON_CATEGORIES);
	});

	it("covers 52 key cells across the twelve maps", () => {
		expect(MAPS.reduce((sum, map) => sum + map.values.length, 0)).toBe(52);
	});
});

describe("the payments copy is the same on web and mobile", () => {
	for (const lang of ["en", "fr"] as const) {
		it(`every ${lang} string matches, modulo each library's placeholder braces`, () => {
			const webStrings = webNs[lang];
			const mobileStrings = mobileNs[lang];
			expect(Object.keys(mobileStrings).sort()).toEqual(
				Object.keys(webStrings).sort(),
			);
			const differing = Object.keys(webStrings).filter(
				(key) =>
					mobileStrings[key] !==
					webStrings[key]?.replace(/\{(\w+)\}/g, "{{$1}}"),
			);
			expect(differing).toEqual([]);
			expect(Object.keys(webStrings)).toHaveLength(149);
		});
	}

	it("ships the holder sentence verbatim on both clients, in English", () => {
		const sentence =
			"Your payment is collected and held by NotchPay, a payment provider. BuyNSellem never holds your money.";
		expect(webNs.en.disclosure_holder).toBe(sentence);
		expect(mobileNs.en.disclosure_holder).toBe(sentence);
	});
});
