import { describe, expect, test } from "bun:test";
import en from "../locales/en.json";
import fr from "../locales/fr.json";
import * as vocab from "./caseStatus";

type Json = { [key: string]: Json | string };

function leaf(node: Json, path: string): string | undefined {
	const value = path
		.split(".")
		.reduce<Json | string | undefined>(
			(acc, part) => (acc && typeof acc === "object" ? acc[part] : undefined),
			node,
		);
	return typeof value === "string" ? value : undefined;
}

const PREFIXES = { returns: en.returns, disputes: en.disputes };
const FR_PREFIXES = { returns: fr.returns, disputes: fr.disputes };

const RETURNS_MAPS = [
	vocab.RETURN_CASE_STATUS_LABELS,
	vocab.RETURN_BASIS_LABELS,
	vocab.RETURN_PAYER_LABELS,
	vocab.INSPECTION_OUTCOME_LABELS,
	vocab.REFUND_METHOD_LABELS,
	vocab.RETURN_ACTION_LABELS,
];
const DISPUTES_MAPS = [
	vocab.DISPUTE_STATUS_LABELS,
	vocab.DISPUTE_REASON_LABELS,
	vocab.DISPUTE_OUTCOME_LABELS,
	vocab.DISPUTE_ACTION_LABELS,
];

/** Mobile keys are fully qualified: `returns.status.requested`. */
function check(
	maps: ReadonlyArray<Readonly<Record<string, string>>>,
	ns: "returns" | "disputes",
) {
	for (const map of maps) {
		for (const key of Object.values(map)) {
			const path = key.slice(key.indexOf(".") + 1);
			expect(key.startsWith(`${ns}.`)).toBe(true);
			expect(leaf(PREFIXES[ns], path)?.length).toBeGreaterThan(0);
			expect(leaf(FR_PREFIXES[ns], path)?.length).toBeGreaterThan(0);
		}
	}
}

describe("the case vocabulary resolves in both languages", () => {
	test("every return key is a non-empty string in en and fr", () => {
		check(RETURNS_MAPS, "returns");
	});

	test("every dispute key is a non-empty string in en and fr", () => {
		check(DISPUTES_MAPS, "disputes");
	});

	test("the maps are total over the API's unions", () => {
		expect(Object.keys(vocab.RETURN_CASE_STATUS_LABELS)).toHaveLength(13);
		expect(Object.keys(vocab.DISPUTE_STATUS_LABELS)).toHaveLength(8);
		expect(Object.keys(vocab.DISPUTE_REASON_LABELS)).toHaveLength(7);
		expect(Object.keys(vocab.RETURN_BASIS_LABELS)).toHaveLength(4);
	});
});
