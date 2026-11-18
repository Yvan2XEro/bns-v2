import { describe, expect, test } from "bun:test";
import en from "../locales/en.json";
import fr from "../locales/fr.json";
import {
	MANUAL_HOLD_REASONS,
	MODERATION_HOLD_REASON_LABELS,
	PAYOUT_ORIGIN_LABELS,
} from "./moderationPayments";

describe("MODERATION_HOLD_REASON_LABELS", () => {
	test("names all eight reasons", () => {
		expect(Object.keys(MODERATION_HOLD_REASON_LABELS).sort()).toEqual([
			"dispute_open",
			"fraud_signal",
			"moderation",
			"payout_account_changed",
			"payout_failed_repeatedly",
			"reconciliation_mismatch",
			"return_open",
			"shop_suspended",
		]);
	});

	test("every key is translated in both locales", () => {
		for (const key of Object.values(MODERATION_HOLD_REASON_LABELS)) {
			const [ns, name] = key.split(".") as [string, string];
			const enNs = (en as Record<string, Record<string, string>>)[ns];
			const frNs = (fr as Record<string, Record<string, string>>)[ns];
			expect(enNs?.[name]?.length).toBeGreaterThan(0);
			expect(frNs?.[name]?.length).toBeGreaterThan(0);
		}
	});
});

describe("MANUAL_HOLD_REASONS", () => {
	test("excludes shop_suspended, the suspension's own hold", () => {
		expect(MANUAL_HOLD_REASONS).not.toContain("shop_suspended");
		expect(MANUAL_HOLD_REASONS).toHaveLength(7);
	});
});

describe("PAYOUT_ORIGIN_LABELS", () => {
	test("covers both origins and both are translated", () => {
		expect(Object.keys(PAYOUT_ORIGIN_LABELS).sort()).toEqual([
			"platform_release",
			"provider_schedule",
		]);
		for (const key of Object.values(PAYOUT_ORIGIN_LABELS)) {
			const [ns, name] = key.split(".") as [string, string];
			const enNs = (en as Record<string, Record<string, string>>)[ns];
			const frNs = (fr as Record<string, Record<string, string>>)[ns];
			expect(enNs?.[name]?.length).toBeGreaterThan(0);
			expect(frNs?.[name]?.length).toBeGreaterThan(0);
		}
	});
});
