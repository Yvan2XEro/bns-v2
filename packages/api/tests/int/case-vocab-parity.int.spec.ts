// @vitest-environment node
import { describe, expect, it } from "vitest";
import * as mobile from "../../../mobile/src/lib/caseStatus";
import mobileEn from "../../../mobile/src/locales/en.json";
import mobileFr from "../../../mobile/src/locales/fr.json";
import webEn from "../../../web/messages/en.json";
import webFr from "../../../web/messages/fr.json";
import * as web from "../../../web/src/lib/case-status";
import {
	DISPUTE_OUTCOMES,
	DISPUTE_REASONS,
	DISPUTE_STATUSES,
} from "../../src/collections/Disputes";
import {
	RETURN_CASE_BASES,
	RETURN_CASE_STATUSES,
} from "../../src/collections/ReturnCases";
import type { ReturnAction, ReturnCaseView } from "../../src/contracts/returns";
import type { ReturnCase } from "../../src/payload-types";

/**
 * The return-case and dispute vocabulary is hand-mirrored in both clients, the
 * `payment-vocab-parity.int.spec.ts` idiom: this file imports both and holds
 * them to the backend's enums and to each other, cell for cell. Mobile calls
 * `t()` without a namespace, so its keys carry `returns.` / `disputes.`; web's
 * are relative to `Returns` / `Disputes`.
 */

type KeyMap = Readonly<Record<string, string>>;

/**
 * `Record<T, true>` makes the compiler hold each list to the API's own union:
 * a value added server-side is a missing property here, a value removed is an
 * excess one, under `check-types:tests`, before any assertion runs.
 */
function keysOf<T extends string>(record: Record<T, true>): string[] {
	return Object.keys(record);
}

/** Every cell where the two clients disagree, named, so a failure says which. */
function divergentCells(
	webMap: KeyMap,
	mobileMap: KeyMap,
	mobilePrefix: string,
): string[] {
	const values = new Set([...Object.keys(webMap), ...Object.keys(mobileMap)]);
	return [...values]
		.filter((value) => mobileMap[value] !== `${mobilePrefix}${webMap[value]}`)
		.map(
			(value) =>
				`${value}: web ${String(webMap[value])}, mobile ${String(mobileMap[value])}`,
		)
		.sort();
}

type Tree = { [key: string]: Tree | string };

function leaves(node: Tree, prefix = ""): Array<[string, string]> {
	return Object.entries(node).flatMap(([key, value]) =>
		typeof value === "string"
			? [[`${prefix}${key}`, value] as [string, string]]
			: leaves(value, `${prefix}${key}.`),
	);
}

const toMobileBraces = (value: string) => value.replace(/\{(\w+)\}/g, "{{$1}}");

type Inspection = NonNullable<
	NonNullable<NonNullable<ReturnCase["items"]>[number]["inspection"]>["outcome"]
>;
type RefundMethod = NonNullable<
	NonNullable<NonNullable<ReturnCase["refund"]>["sellerProof"]>["method"]
>;
type Payer = NonNullable<ReturnCaseView["returnShippingPaidBy"]>;

const API_INSPECTION_OUTCOMES = keysOf<Inspection>({
	restock: true,
	damaged_by_buyer: true,
	damaged_in_transit: true,
	not_matching: true,
	missing: true,
});
const API_REFUND_METHODS = keysOf<RefundMethod>({
	cash: true,
	mtn_momo: true,
	orange_money: true,
});
const API_PAYERS = keysOf<Payer>({ buyer: true, seller: true });
const API_RETURN_ACTIONS = keysOf<ReturnAction>({
	ship: true,
	pickup: true,
	receive: true,
	inspect: true,
	accept_deduction: true,
	contest_deduction: true,
	refund_proof: true,
	confirm_refund: true,
	contest_refund: true,
	cancel: true,
	upload_evidence: true,
});
// The thread screens' six buttons. The API's allowedActions also carries
// message, upload_evidence, respond_propose and respond_contest, which have
// their own controls (composer, uploader, proposal form) and no button label.
const DISPUTE_BUTTON_ACTIONS = [
	"submit",
	"withdraw",
	"escalate",
	"respond_accept",
	"proposal_accept",
	"proposal_reject",
];

const MAPS: ReadonlyArray<{
	name: string;
	ns: "returns" | "disputes";
	web: KeyMap;
	mobile: KeyMap;
	values: readonly string[];
}> = [
	{
		name: "RETURN_CASE_STATUS_LABELS",
		ns: "returns",
		web: web.RETURN_CASE_STATUS_LABELS,
		mobile: mobile.RETURN_CASE_STATUS_LABELS,
		values: RETURN_CASE_STATUSES,
	},
	{
		name: "RETURN_BASIS_LABELS",
		ns: "returns",
		web: web.RETURN_BASIS_LABELS,
		mobile: mobile.RETURN_BASIS_LABELS,
		values: RETURN_CASE_BASES,
	},
	{
		name: "RETURN_PAYER_LABELS",
		ns: "returns",
		web: web.RETURN_PAYER_LABELS,
		mobile: mobile.RETURN_PAYER_LABELS,
		values: API_PAYERS,
	},
	{
		name: "INSPECTION_OUTCOME_LABELS",
		ns: "returns",
		web: web.INSPECTION_OUTCOME_LABELS,
		mobile: mobile.INSPECTION_OUTCOME_LABELS,
		values: API_INSPECTION_OUTCOMES,
	},
	{
		name: "REFUND_METHOD_LABELS",
		ns: "returns",
		web: web.REFUND_METHOD_LABELS,
		mobile: mobile.REFUND_METHOD_LABELS,
		values: API_REFUND_METHODS,
	},
	{
		name: "RETURN_ACTION_LABELS",
		ns: "returns",
		web: web.RETURN_ACTION_LABELS,
		mobile: mobile.RETURN_ACTION_LABELS,
		values: API_RETURN_ACTIONS,
	},
	{
		name: "DISPUTE_STATUS_LABELS",
		ns: "disputes",
		web: web.DISPUTE_STATUS_LABELS,
		mobile: mobile.DISPUTE_STATUS_LABELS,
		values: DISPUTE_STATUSES,
	},
	{
		name: "DISPUTE_REASON_LABELS",
		ns: "disputes",
		web: web.DISPUTE_REASON_LABELS,
		mobile: mobile.DISPUTE_REASON_LABELS,
		values: DISPUTE_REASONS,
	},
	{
		name: "DISPUTE_OUTCOME_LABELS",
		ns: "disputes",
		web: web.DISPUTE_OUTCOME_LABELS,
		mobile: mobile.DISPUTE_OUTCOME_LABELS,
		values: DISPUTE_OUTCOMES,
	},
	{
		name: "DISPUTE_ACTION_LABELS",
		ns: "disputes",
		web: web.DISPUTE_ACTION_LABELS,
		mobile: mobile.DISPUTE_ACTION_LABELS,
		values: DISPUTE_BUTTON_ACTIONS,
	},
];

const NAMESPACES = [
	{
		web: "Returns",
		mobile: "returns",
		webTree: { en: webEn.Returns, fr: webFr.Returns },
		mobileTree: { en: mobileEn.returns, fr: mobileFr.returns },
		// 109: the 96 web leaves plus the 16 mobile-only ones mirrored into web,
		// less `party` (2, folded into `payer`) and `awaitingCount` (EXEMPT).
		count: 109,
	},
	{
		web: "Disputes",
		mobile: "disputes",
		webTree: { en: webEn.Disputes, fr: webFr.Disputes },
		mobileTree: { en: mobileEn.disputes, fr: mobileFr.disputes },
		// 94: the 65 web leaves plus the 30 mobile-only ones (report flow,
		// evidence, the disabled gate, the six action buttons) mirrored into
		// web, less `awaitingCount` (EXEMPT).
		count: 94,
	},
] as const;

// `awaitingCount` is an ICU plural on web ({count, plural, ...}); i18next's
// plural form is a different key shape, so the one sentence cannot be
// byte-equal. Mobile renders no such counter. `openInWorkspace` is the web
// shell split's cross-link from the buyer case page into the seller
// workspace; mobile has no workspace frame to link into. Every other key
// must match.
const EXEMPT = new Set(["awaitingCount", "openInWorkspace"]);

describe("each client's case vocabulary covers the backend's enums", () => {
	for (const { name, web: webMap, mobile: mobileMap, values } of MAPS) {
		it(`${name} labels exactly the values the API can send`, () => {
			expect(values.length).toBeGreaterThan(1);
			expect(Object.keys(webMap).sort()).toEqual([...values].sort());
			expect(Object.keys(mobileMap).sort()).toEqual([...values].sort());
		});
	}
});

describe("the two clients' case vocabularies are the same table", () => {
	for (const { name, ns, web: webMap, mobile: mobileMap, values } of MAPS) {
		it(`${name} agrees cell for cell`, () => {
			expect(divergentCells(webMap, mobileMap, `${ns}.`)).toEqual([]);
			expect(Object.keys(webMap)).toHaveLength(values.length);
		});
	}

	it("covers 63 key cells across the ten maps", () => {
		// 13 statuses + 4 bases + 2 payers + 5 inspection outcomes + 3 refund
		// methods + 11 return actions, then 8 + 7 + 4 + 6 on the dispute side.
		expect(MAPS.reduce((sum, map) => sum + map.values.length, 0)).toBe(63);
	});
});

describe("the return and dispute copy is the same on web and mobile", () => {
	for (const space of NAMESPACES) {
		for (const lang of ["en", "fr"] as const) {
			it(`every ${space.web} ${lang} string matches, modulo each library's placeholder braces`, () => {
				const webStrings = new Map(
					leaves(space.webTree[lang]).filter(([key]) => !EXEMPT.has(key)),
				);
				const mobileStrings = new Map(leaves(space.mobileTree[lang]));
				expect([...mobileStrings.keys()].sort()).toEqual(
					[...webStrings.keys()].sort(),
				);
				const differing = [...webStrings]
					.filter(
						([key, value]) => mobileStrings.get(key) !== toMobileBraces(value),
					)
					.map(([key]) => key);
				expect(differing).toEqual([]);
				expect(webStrings.size).toBe(space.count);
			});
		}
	}

	it("keeps the ICU plural counter on web only", () => {
		for (const lang of ["en", "fr"] as const) {
			expect(Object.keys(webNs(lang, "Returns"))).toContain("awaitingCount");
			expect(Object.keys(webNs(lang, "Disputes"))).toContain("awaitingCount");
		}
	});
});

function webNs(lang: "en" | "fr", ns: "Returns" | "Disputes"): Tree {
	return (lang === "en" ? webEn : webFr)[ns];
}
