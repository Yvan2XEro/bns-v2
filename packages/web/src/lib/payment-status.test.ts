import { describe, expect, test } from "bun:test";
import en from "~/../messages/en.json";
import fr from "~/../messages/fr.json";
import {
	CONNECTED_ACCOUNT_STATUSES,
	HOLD_CATEGORY_DESCRIPTIONS,
	HOLD_CATEGORY_LABELS,
	HOLD_REASON_CATEGORIES,
	holdReasonCategory,
	NAME_MATCH_RESULTS,
	PAYMENT_CHANNEL_INSTRUCTIONS,
	PAYMENT_CHANNEL_LABELS,
	PAYMENT_FAILURE_MESSAGES,
	PAYMENT_INTENT_STATUSES,
	PAYOUT_ACCOUNT_STATUSES,
	PAYOUT_METHODS,
	PAYOUT_STATUSES,
	type PayoutHoldReason,
	REFUND_STATUSES,
} from "./payment-status";

const enNs: Record<string, string> = en.Payments;
const frNs: Record<string, string> = fr.Payments;

/**
 * Transcribed from the P5 spec's field tables, not derived from the maps, so
 * a value dropped from a map and from this list at once still fails the
 * API-side parity spec, and dropped from the map alone fails here.
 */
const KEY_MAPS: ReadonlyArray<{
	name: string;
	map: Readonly<Record<string, string>>;
	values: readonly string[];
}> = [
	{
		name: "PAYMENT_INTENT_STATUSES",
		map: PAYMENT_INTENT_STATUSES,
		values: [
			"created",
			"pending",
			"succeeded",
			"failed",
			"cancelled",
			"expired",
		],
	},
	{
		name: "PAYMENT_FAILURE_MESSAGES",
		map: PAYMENT_FAILURE_MESSAGES,
		values: [
			"declined",
			"insufficient_funds",
			"timeout",
			"limit_exceeded",
			"invalid_number",
			"provider_error",
		],
	},
	{
		name: "PAYMENT_CHANNEL_LABELS",
		map: PAYMENT_CHANNEL_LABELS,
		values: ["cm.mtn", "cm.orange"],
	},
	{
		name: "PAYMENT_CHANNEL_INSTRUCTIONS",
		map: PAYMENT_CHANNEL_INSTRUCTIONS,
		values: ["cm.mtn", "cm.orange"],
	},
	{
		name: "PAYOUT_STATUSES",
		map: PAYOUT_STATUSES,
		values: [
			"scheduled",
			"pending",
			"sent",
			"processing",
			"complete",
			"failed",
			"reversed",
			"cancelled",
		],
	},
	{
		name: "REFUND_STATUSES",
		map: REFUND_STATUSES,
		values: ["created", "pending", "processing", "succeeded", "failed"],
	},
	{
		name: "CONNECTED_ACCOUNT_STATUSES",
		map: CONNECTED_ACCOUNT_STATUSES,
		values: [
			"created",
			"onboarding",
			"restricted",
			"active",
			"disabled",
			"deauthorized",
		],
	},
	{
		name: "PAYOUT_ACCOUNT_STATUSES",
		map: PAYOUT_ACCOUNT_STATUSES,
		values: [
			"pending_verification",
			"pending_review",
			"active",
			"rejected",
			"replaced",
		],
	},
	{
		name: "PAYOUT_METHODS",
		map: PAYOUT_METHODS,
		values: ["mtn_momo", "orange_money", "bank"],
	},
	{
		name: "NAME_MATCH_RESULTS",
		map: NAME_MATCH_RESULTS,
		values: ["match", "partial", "mismatch"],
	},
	{
		name: "HOLD_CATEGORY_LABELS",
		map: HOLD_CATEGORY_LABELS,
		values: ["security", "review", "operations"],
	},
	{
		name: "HOLD_CATEGORY_DESCRIPTIONS",
		map: HOLD_CATEGORY_DESCRIPTIONS,
		values: ["security", "review", "operations"],
	},
];

const HOLD_REASONS: readonly PayoutHoldReason[] = [
	"payout_account_changed",
	"fraud_signal",
	"reconciliation_mismatch",
	"dispute_open",
	"return_open",
	"moderation",
	"payout_failed_repeatedly",
	"shop_suspended",
];

function placeholders(text: string): string[] {
	return [...text.matchAll(/\{(\w+)\}/g)].map((m) => m[1] as string).sort();
}

describe("the payment label maps", () => {
	for (const { name, map, values } of KEY_MAPS) {
		test(`${name} covers exactly its enum`, () => {
			expect(Object.keys(map).sort()).toEqual([...values].sort());
		});

		test(`${name} names a key that is translated in both locales`, () => {
			for (const key of Object.values(map)) {
				expect(enNs[key]?.length).toBeGreaterThan(0);
				expect(frNs[key]?.length).toBeGreaterThan(0);
			}
		});

		test(`${name} gives every value its own key`, () => {
			const keys = Object.values(map);
			expect(new Set(keys).size).toBe(values.length);
		});
	}

	test("the twelve maps hold 52 cells between them", () => {
		expect(
			KEY_MAPS.reduce((sum, { map }) => sum + Object.keys(map).length, 0),
		).toBe(52);
	});
});

describe("holdReasonCategory", () => {
	test("puts each of the eight reasons in the category the owner sees", () => {
		expect(HOLD_REASONS.map((reason) => holdReasonCategory(reason))).toEqual([
			"security",
			"security",
			"operations",
			"review",
			"review",
			"review",
			"operations",
			"review",
		]);
	});

	test("is total over exactly the eight reasons", () => {
		expect(Object.keys(HOLD_REASON_CATEGORIES).sort()).toEqual(
			[...HOLD_REASONS].sort(),
		);
	});

	test("leaves no category without a reason", () => {
		const used: string[] = HOLD_REASONS.map((reason) =>
			holdReasonCategory(reason),
		);
		expect([...new Set(used)].sort()).toEqual(
			Object.keys(HOLD_CATEGORY_LABELS).sort(),
		);
	});
});

describe("the Payments namespace", () => {
	test("has the same keys in en and fr", () => {
		expect(Object.keys(frNs).sort()).toEqual(Object.keys(enNs).sort());
		expect(Object.keys(enNs)).toHaveLength(149);
	});

	test("carries the same placeholders in both languages, in next-intl's single braces", () => {
		for (const key of Object.keys(enNs)) {
			expect(placeholders(frNs[key] as string)).toEqual(
				placeholders(enNs[key] as string),
			);
			expect(enNs[key]).not.toContain("{{");
			expect(frNs[key]).not.toContain("{{");
		}
		expect(placeholders(enNs.pay_submit as string)).toEqual(["amount"]);
	});

	// The spec's disclosure sentences ship verbatim; a reworded legal line
	// must be a deliberate edit of this test, not a drive-by copy change.
	test("ships the spec's disclosure sentences verbatim", () => {
		expect(enNs.disclosure_listingBadge).toBe(
			"Protected payment available: your money is released to the seller only after delivery. Fee: 3% (min 100 FCFA)",
		);
		expect(enNs.disclosure_holder).toBe(
			"Your payment is collected and held by NotchPay, a payment provider. BuyNSellem never holds your money.",
		);
		expect(enNs.disclosure_sellerLegend).toBe(
			"Funds are held by NotchPay. BuyNSellem never holds your money.",
		);
		expect(frNs.disclosure_listingBadge).toBe(
			"Paiement protégé disponible : votre argent n'est versé au vendeur qu'après la livraison. Frais : 3 % (min. 100 FCFA)",
		);
		expect(frNs.disclosure_holder).toBe(
			"Votre paiement est encaissé et détenu par NotchPay, un prestataire de paiement. BuyNSellem ne détient jamais votre argent.",
		);
		expect(frNs.disclosure_sellerLegend).toBe(
			"Les fonds sont détenus par NotchPay. BuyNSellem ne détient jamais votre argent.",
		);
	});
});
