import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { Glob } from "bun";
import en from "./en.json";
import fr from "./fr.json";

type Json = { [key: string]: Json | string };

function getPath(node: Json, path: string): Json | string | undefined {
	return path
		.split(".")
		.reduce<Json | string | undefined>(
			(acc, key) => (acc && typeof acc === "object" ? acc[key] : undefined),
			node,
		);
}

const SRC_ROOT = join(import.meta.dir, "..");
const APP_ROOT = join(import.meta.dir, "../../app");

/**
 * The twin of `packages/web/src/lib/messages-keys.test.ts`, adapted to how
 * mobile reaches a translation: `useTranslation()` with no namespace
 * argument (every call is fully qualified, `t("orderStatus.title")`), and a
 * zod validator's `message` string that IS the translation key, rendered
 * later through `t(errors.field.message)` — `parity.test.ts`'s own
 * `extractCalledKeys` already covers both shapes; this file reuses the same
 * two patterns rather than inventing a third extractor to maintain.
 */
function extractCalledKeys(files: string[]): Set<string> {
	const keys = new Set<string>();
	const tCallRe = /(?<![a-zA-Z0-9_])t\(\s*(`[^`]*`|"[^"]*"|'[^']*')/g;
	const messageKeyRe = /\bmessage:\s*"([a-zA-Z][\w.]*\.[a-zA-Z][\w.]*)"/g;
	const regexMessageKeyRe =
		/\.regex\([^,()]*,\s*"([a-zA-Z][\w.]*\.[a-zA-Z][\w.]*)"\)/g;

	for (const file of files) {
		const text = readFileSync(file, "utf8");
		for (const match of text.matchAll(tCallRe)) {
			const literal = match[1] as string;
			const inner = literal.slice(1, -1);
			if (literal[0] === "`" && inner.includes("${")) continue;
			keys.add(inner);
		}
		for (const match of text.matchAll(messageKeyRe))
			keys.add(match[1] as string);
		for (const match of text.matchAll(regexMessageKeyRe)) {
			keys.add(match[1] as string);
		}
	}
	return keys;
}

function listSourceFiles(root: string): string[] {
	const glob = new Glob("**/*.{ts,tsx}");
	const files: string[] = [];
	for (const rel of glob.scanSync({ cwd: root })) {
		if (rel.includes(".test.")) continue;
		files.push(join(root, rel));
	}
	return files;
}

/**
 * Parity is not presence. `parity.test.ts` compares en against fr; a key
 * missing from BOTH satisfies that comparison perfectly. This file asks the
 * other question: does every key the code calls exist? Measured on
 * 2026-10-02, after Task 7 landed its six P4 namespaces: 0 — Task 7 ships no
 * screen that calls into `orderStatus`, `cart`, `checkout`, `purchases`,
 * `sellerOrders` or `billing` yet ("Links out: nothing"), so none of its own
 * keys can appear here as missing; this ceiling only covers whatever the
 * rest of the app already called correctly.
 */
const CALLED_KEY_MISSING_CEILING = 0;

describe("every key the code calls exists in both locales", () => {
	test("no key is missing beyond the pre-existing backlog", () => {
		const files = [...listSourceFiles(SRC_ROOT), ...listSourceFiles(APP_ROOT)];
		const calledKeys = extractCalledKeys(files);
		const missing = [...calledKeys].filter(
			(key) =>
				getPath(en as Json, key) === undefined ||
				getPath(fr as Json, key) === undefined,
		);
		if (missing.length > CALLED_KEY_MISSING_CEILING) {
			throw new Error(
				`${missing.length} translation keys are called and missing:\n${missing
					.map((key) => `  ${key}`)
					.join("\n")}`,
			);
		}
		expect(missing.length).toBeLessThanOrEqual(CALLED_KEY_MISSING_CEILING);
	});
});

/**
 * `t(\`orderStatus.status_${status}_${audience}\`)` is invisible to the
 * regex above, and so is every other computed family this task introduces:
 * a tab key, a delivery-failure reason, a buyer cancellation reason, a
 * seller-visible customer tier. Each is pinned here from a list transcribed
 * from `orderStatus.ts` and `locales/en.json`, not derived from either at
 * runtime.
 */
describe("every computed-family key the code could pick at runtime exists", () => {
	const STATUS_KEYS = [
		["status_placed_buyer", "status_placed_seller"],
		["status_confirmed_buyer", "status_placed_seller"],
		["status_paid_buyer", "status_placed_seller"],
		["status_accepted_buyer", "status_accepted_seller"],
		["status_shipped_buyer", "status_shipped_seller"],
		["status_delivered_buyer", "status_delivered_seller"],
		["status_completed_buyer", "status_delivered_seller"],
		["status_cancelled_buyer", "status_cancelled_seller"],
		["status_failed_buyer", "status_failed_seller"],
		["status_returned_buyer", "status_returned_seller"],
		["status_disputed_buyer", "status_disputed_seller"],
	].flat();

	const TAB_KEYS = [
		"tab_to_accept",
		"tab_to_ship",
		"tab_shipped",
		"tab_delivered",
		"tab_cancelled",
		"tab_failed",
	];

	const FAILURE_REASON_KEYS = [
		"failure_refused",
		"failure_unreachable",
		"failure_absent",
		"failure_address_not_found",
		"failure_timeout",
		"failure_other",
	];

	// Two, not eleven: `cancellation.reason` stores only these two from a
	// buyer (spec line 151), and `parseBuyerCancelReason` refuses the rest.
	const CANCEL_REASON_KEYS = [
		"cancelReason_changedMind",
		"cancelReason_orderedByMistake",
	];

	const TIER_KEYS = ["tierNew", "tierRegular", "tierTrusted", "tierWatch"];

	test("the lists have the sizes the runtime families actually have", () => {
		expect(STATUS_KEYS).toHaveLength(22);
		expect(TAB_KEYS).toHaveLength(6);
		expect(FAILURE_REASON_KEYS).toHaveLength(6);
		expect(CANCEL_REASON_KEYS).toHaveLength(2);
		expect(TIER_KEYS).toHaveLength(4);
	});

	test("every status, tab and failure-reason key exists in orderStatus, both locales", () => {
		for (const key of [...STATUS_KEYS, ...TAB_KEYS, ...FAILURE_REASON_KEYS]) {
			expect(getPath(en as Json, `orderStatus.${key}`)).not.toBeUndefined();
			expect(getPath(fr as Json, `orderStatus.${key}`)).not.toBeUndefined();
		}
	});

	test("every cancellation reason exists in purchases, both locales", () => {
		for (const key of CANCEL_REASON_KEYS) {
			expect(getPath(en as Json, `purchases.${key}`)).not.toBeUndefined();
			expect(getPath(fr as Json, `purchases.${key}`)).not.toBeUndefined();
		}
	});

	test("every tier key exists in sellerOrders, both locales", () => {
		for (const key of TIER_KEYS) {
			expect(getPath(en as Json, `sellerOrders.${key}`)).not.toBeUndefined();
			expect(getPath(fr as Json, `sellerOrders.${key}`)).not.toBeUndefined();
		}
	});
});

/**
 * Task 7 ships no screen, so the scanner above has nothing to miss in
 * `orderStatus`, `cart`, `checkout`, `purchases`, `sellerOrders` or
 * `billing` yet. Without this manifest, deleting one of the six namespaces
 * from both locale files right now would pass every existing test: en/fr
 * lockstep in `parity.test.ts` is satisfied trivially by two empty sets, and
 * the called-keys scanner has nothing to miss because nothing calls it. This
 * hard-coded transcription of Task 7's own key list (Step 4 of its brief) is
 * what still fails that mutation.
 */
describe("every key Task 7 promised for its own namespaces exists", () => {
	const NAMESPACE_MANIFEST: Record<string, string[]> = {
		orderStatus: [
			"status_placed_buyer",
			"status_placed_seller",
			"status_confirmed_buyer",
			"status_paid_buyer",
			"status_accepted_buyer",
			"status_accepted_seller",
			"status_shipped_buyer",
			"status_shipped_seller",
			"status_delivered_buyer",
			"status_delivered_seller",
			"status_completed_buyer",
			"status_cancelled_buyer",
			"status_cancelled_seller",
			"status_failed_buyer",
			"status_failed_seller",
			"status_returned_buyer",
			"status_returned_seller",
			"status_disputed_buyer",
			"status_disputed_seller",
			"tab_to_accept",
			"tab_to_ship",
			"tab_shipped",
			"tab_delivered",
			"tab_cancelled",
			"tab_failed",
			"failure_refused",
			"failure_unreachable",
			"failure_absent",
			"failure_address_not_found",
			"failure_timeout",
			"failure_other",
		],
		cart: [
			"title",
			"empty",
			"emptyCta",
			"shopHeader",
			"priceChanged",
			"unavailable",
			"maxQuantity",
			"remove",
			"quantity",
			"subtotal",
			"checkout",
			"singleShopTitle",
			"singleShopBody",
			"singleShopReplace",
			"singleShopKeep",
			"selfPurchase",
			"signInToAdd",
		],
		checkout: [
			"stepAddress",
			"stepDelivery",
			"stepReview",
			"recipientName",
			"phone",
			"city",
			"cityLocked",
			"district",
			"districtOther",
			"landmark",
			"landmarkHelp",
			"instructions",
			"useMyLocation",
			"locationAccuracy",
			"openInMaps",
			"deliveryOptions",
			"pickupPoint",
			"eta",
			"fee",
			"free",
			"summary",
			"editCart",
			"editAddress",
			"editDelivery",
			"preContract",
			"sellerIdentity",
			"salesTerms",
			"withdrawalInfo",
			"languageToggle",
			"acceptTerms",
			"placeOrder",
			"quoteChanged",
			"quoteChangedBody",
			"confirmationNeededCode",
			"confirmationNeededCall",
			"codeSent",
			"enterCode",
			"resendCode",
			"resendIn",
			"confirmed",
			"viewOrder",
		],
		purchases: [
			"title",
			"tabOpen",
			"tabDelivered",
			"tabCancelled",
			"empty",
			"orderNumber",
			"placedOn",
			"timeline",
			"items",
			"amounts",
			"deliveryDetails",
			"handoverTitle",
			"handoverBody",
			"handoverRegenerate",
			"handoverRegenerateLeft",
			"handoverLocked",
			"handoverLockedBody",
			"confirmReceipt",
			"confirmReceiptBody",
			"contestDelivery",
			"contestBody",
			"contestWindow",
			"cancel",
			"cancelReason",
			"cancelConfirm",
			"returnItem",
			"returnWindow",
			"returnWindowClosed",
			"reviewShop",
			"downloadReceipt",
			"openConversation",
			"withdrawalItems",
			"withdrawalMethod",
			"withdrawalReason",
			"withdrawalSubmit",
			"withdrawalSent",
			"cancelReason_changedMind",
			"cancelReason_orderedByMistake",
		],
		sellerOrders: [
			"title",
			"search",
			"columnNumber",
			"columnDate",
			"columnCustomer",
			"columnItems",
			"columnTotal",
			"columnDeadline",
			"columnTier",
			"tierNew",
			"tierRegular",
			"tierTrusted",
			"tierWatch",
			"callBuyer",
			"openInMaps",
			"confirmByCall",
			"confirmByCallAccept",
			"accept",
			"decline",
			"declineReason",
			"ship",
			"enterHandoverCode",
			"handoverAttemptsLeft",
			"handoverWrong",
			"handoverLocked",
			"handoverFallbacks",
			"reportFailedAttempt",
			"markFailed",
			"failureReason",
			"declareDelivered",
			"declareDeliveredBody",
			"declarePhoto",
			"cancelOrder",
			"cancelOrderReason",
			"commission",
			"acceptDeadline",
			"smsNotDelivered",
		],
		billing: [
			"title",
			"invoiceNumber",
			"period",
			"ordersCount",
			"commissionTotal",
			"vat",
			"totalDue",
			"dueAt",
			"statusIssued",
			"statusPaid",
			"statusOverdue",
			"statusWaived",
			"statusVoid",
			"pay",
			"payOpening",
			"document",
			"currentPeriod",
			"accruedSoFar",
			"restrictedTitle",
			"restrictedBody",
			"orderSettingsTitle",
			"codEnabled",
			"sellerDelivery",
			"deliveryFee",
			"deliveryFeeDefault",
			"etaText",
			"pickupEnabled",
			"pickupAddress",
			"pickupHours",
			"salesTermsExtra",
			"capsNotice",
			"launchCityNotice",
			"save",
			"saved",
		],
	};

	test("the manifest covers exactly the namespaces Task 7 owns", () => {
		expect(Object.keys(NAMESPACE_MANIFEST).sort()).toEqual(
			[
				"billing",
				"cart",
				"checkout",
				"orderStatus",
				"purchases",
				"sellerOrders",
			].sort(),
		);
	});

	test("every manifest key resolves in both en and fr", () => {
		const missing: string[] = [];
		for (const [namespace, keys] of Object.entries(NAMESPACE_MANIFEST)) {
			for (const key of keys) {
				const path = `${namespace}.${key}`;
				if (getPath(en as Json, path) === undefined) missing.push(`en:${path}`);
				if (getPath(fr as Json, path) === undefined) missing.push(`fr:${path}`);
			}
		}
		expect(missing).toEqual([]);
	});
});

/**
 * The twin of the web check: the copy and the data model, compared.
 *
 * `cancellation.reason` on an order is a select over the spec's twelve
 * reasons (spec line 151), of which exactly two are the buyer's own, and
 * `parseBuyerCancelReason` refuses anything else. These locale files once
 * offered eleven: nine of them would have been recorded as a reason the
 * buyer did not give. The set is asserted in both directions, so a key
 * re-added to the copy fails here as loudly as one deleted from it.
 */
describe("the buyer cancellation copy and the order model agree", () => {
	const BUYER_CANCEL_REASONS = [
		"buyer_changed_mind",
		"buyer_ordered_by_mistake",
	] as const;

	const KEY_OF_REASON: Record<(typeof BUYER_CANCEL_REASONS)[number], string> = {
		buyer_changed_mind: "cancelReason_changedMind",
		buyer_ordered_by_mistake: "cancelReason_orderedByMistake",
	};

	const shippedKeys = (catalogue: Json): string[] => {
		const purchases = catalogue.purchases;
		if (!purchases || typeof purchases !== "object") return [];
		return Object.keys(purchases)
			.filter((key) => key.startsWith("cancelReason_"))
			.sort();
	};

	test("every reason the model stores has a key, in both locales", () => {
		expect(BUYER_CANCEL_REASONS).toHaveLength(2);
		for (const reason of BUYER_CANCEL_REASONS) {
			const path = `purchases.${KEY_OF_REASON[reason]}`;
			expect(getPath(en as Json, path)).not.toBeUndefined();
			expect(getPath(fr as Json, path)).not.toBeUndefined();
		}
	});

	test("the copy offers no reason the model cannot store", () => {
		const expected = Object.values(KEY_OF_REASON).sort();
		expect(shippedKeys(en as Json)).toEqual(expected);
		expect(shippedKeys(fr as Json)).toEqual(expected);
	});
});
