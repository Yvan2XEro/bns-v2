import { describe, expect, test } from "bun:test";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import en from "~/../messages/en.json";
import fr from "~/../messages/fr.json";

type Json = { [key: string]: Json | string };

/**
 * Parity is not presence. A namespace missing from BOTH languages is in
 * perfect parity, which is how `Team.noShop` and `shopActivity.locked`
 * shipped rendering their own key path to users while every gate was green.
 * This test asks the other question: does every key the code calls exist?
 *
 * The ceiling is the pre-existing backlog measured when this test was
 * written, on 2026-10-02: 336, entirely false positives from one known
 * limitation of this scanner, not 336 real missing translations. A file
 * that calls `useTranslations` more than once — `create-listing-form.tsx`
 * alone calls it five times, for `CreateListing`, `Listing`, `Common`,
 * `Condition` and `Shop` — has every one of those namespaces attributed to
 * every literal `t("...")` call in the file, because this function collects
 * *all* namespaces found anywhere in a file and cross-multiplies them
 * against every `t(` call, not just the namespace the call's own variable
 * was bound to (`tListing`, `tCommon`, …; only a call through a variable
 * literally named `t` is matched at all). `CreateListing.photosDesc` is the
 * real key; `Listing.photosDesc`, `Common.photosDesc`,
 * `Condition.photosDesc` and `Shop.photosDesc` are the four false alarms
 * generated alongside it. None of the 336 touch a Task 7 file or namespace
 * (verified: every missing entry's file is pre-existing, none of this
 * task's `OrderStatus`/`Cart`/`Checkout`/`Purchases`/`SellerOrders`/`Billing`
 * namespaces call `t()` from a screen yet — Task 7 links out to nothing).
 * A real fix (naming each hook's variable so this scanner can tell them
 * apart, or scoping namespace collection per call) lowers the number and
 * the constant below drops with it; a new screen that forgets a translation
 * raises it and fails here.
 */
const PRE_EXISTING_MISSING_CEILING = 336;

function sourceFiles(dir: string): string[] {
	return readdirSync(dir).flatMap((entry) => {
		const path = join(dir, entry);
		if (statSync(path).isDirectory()) return sourceFiles(path);
		return /\.(ts|tsx)$/.test(path) && !path.endsWith(".test.ts") ? [path] : [];
	});
}

function calledKeys(): Array<{ file: string; key: string }> {
	const out: Array<{ file: string; key: string }> = [];
	for (const file of sourceFiles(join(import.meta.dir, ".."))) {
		const text = readFileSync(file, "utf8");
		// One namespace per file is the convention; a file using two is listed twice.
		const namespaces = [
			...text.matchAll(/(?:useTranslations|getTranslations)\(\s*"([^"]+)"/g),
		].map((m) => m[1]);
		if (namespaces.length === 0) continue;
		for (const match of text.matchAll(/\bt\(\s*"([^"{}$]+)"/g)) {
			for (const namespace of namespaces)
				out.push({ file, key: `${namespace}.${match[1]}` });
		}
	}
	return out;
}

const leaf = (node: Json, path: string): string | undefined => {
	const value = path
		.split(".")
		.reduce<Json | string | undefined>(
			(acc, part) => (acc && typeof acc === "object" ? acc[part] : undefined),
			node,
		);
	return typeof value === "string" ? value : undefined;
};

describe("every key the code calls exists in both locales", () => {
	test("no key is missing beyond the pre-existing backlog", () => {
		const missing = calledKeys().filter(
			({ key }) =>
				leaf(en as Json, key) === undefined ||
				leaf(fr as Json, key) === undefined,
		);
		if (missing.length > PRE_EXISTING_MISSING_CEILING) {
			throw new Error(
				`${missing.length} translation keys are called and missing:\n${missing
					.map(({ file, key }) => `  ${key}  (${file})`)
					.join("\n")}`,
			);
		}
		expect(missing.length).toBeLessThanOrEqual(PRE_EXISTING_MISSING_CEILING);
	});
});

/**
 * A regex that only matches `t("literal")` cannot see a key chosen at
 * runtime: `t(statusLabelKey(status, audience))` on the order-status screens,
 * `t(\`orderStatus.tab_${tab}\`)` on the tab bar, a failure reason picked
 * from `OrderStatus.failure_*`, a cancellation reason from
 * `Purchases.cancelReason_*`, or a customer tier from
 * `SellerOrders.tier*`. The scanner above is blind to all five families, so
 * each is pinned here instead, by a list transcribed from the tables in
 * `order-status.ts` and `messages/en.json` — not derived from either at
 * runtime, so a key deleted from both sides at once still fails this.
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

	test("every status, tab and failure-reason key exists in OrderStatus, both locales", () => {
		for (const key of [...STATUS_KEYS, ...TAB_KEYS, ...FAILURE_REASON_KEYS]) {
			expect(leaf(en as Json, `OrderStatus.${key}`)).not.toBeUndefined();
			expect(leaf(fr as Json, `OrderStatus.${key}`)).not.toBeUndefined();
		}
	});

	test("every cancellation reason exists in Purchases, both locales", () => {
		for (const key of CANCEL_REASON_KEYS) {
			expect(leaf(en as Json, `Purchases.${key}`)).not.toBeUndefined();
			expect(leaf(fr as Json, `Purchases.${key}`)).not.toBeUndefined();
		}
	});

	test("every tier key exists in SellerOrders, both locales", () => {
		for (const key of TIER_KEYS) {
			expect(leaf(en as Json, `SellerOrders.${key}`)).not.toBeUndefined();
			expect(leaf(fr as Json, `SellerOrders.${key}`)).not.toBeUndefined();
		}
	});
});

/**
 * Task 7 ships no screen, so nothing in `src/` calls `useTranslations("Cart")`
 * or `useTranslations("Billing")` yet — the calledKeys() scanner above is
 * blind to every key in these six namespaces for exactly the same reason it
 * is blind to a computed key: it only sees a `t(` call that exists in code,
 * and this task's own vocabulary has no caller until a wave-10-13 task picks
 * it up ("Links out: nothing"). Without this manifest, deleting an entire
 * namespace from both locale files right now would pass every test in this
 * repository — `messages-parity.test.ts`'s en/fr lockstep check is satisfied
 * trivially by two empty sets, and the calledKeys() scanner has nothing to
 * miss because nothing calls it. This hard-coded transcription of Task 7's
 * own key list (Step 4 of its brief) is what still fails: delete `Billing`
 * from both `en.json` and `fr.json` and this test is red while
 * `messages-parity.test.ts` stays green, which is the proof the two gates
 * are not doing the same job.
 */
describe("every key Task 7 promised for its own namespaces exists", () => {
	const NAMESPACE_MANIFEST: Record<string, string[]> = {
		OrderStatus: [
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
		Cart: [
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
		Checkout: [
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
		Purchases: [
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
		SellerOrders: [
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
		Billing: [
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
				"Billing",
				"Cart",
				"Checkout",
				"OrderStatus",
				"Purchases",
				"SellerOrders",
			].sort(),
		);
	});

	test("every manifest key resolves in both en and fr", () => {
		const missing: string[] = [];
		for (const [namespace, keys] of Object.entries(NAMESPACE_MANIFEST)) {
			for (const key of keys) {
				const path = `${namespace}.${key}`;
				if (leaf(en as Json, path) === undefined) missing.push(`en:${path}`);
				if (leaf(fr as Json, path) === undefined) missing.push(`fr:${path}`);
			}
		}
		expect(missing).toEqual([]);
	});
});

/**
 * The copy and the data model, compared.
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
		const purchases = catalogue.Purchases;
		if (!purchases || typeof purchases !== "object") return [];
		return Object.keys(purchases)
			.filter((key) => key.startsWith("cancelReason_"))
			.sort();
	};

	test("every reason the model stores has a key, in both locales", () => {
		expect(BUYER_CANCEL_REASONS).toHaveLength(2);
		for (const reason of BUYER_CANCEL_REASONS) {
			const path = `Purchases.${KEY_OF_REASON[reason]}`;
			expect(leaf(en as Json, path)).not.toBeUndefined();
			expect(leaf(fr as Json, path)).not.toBeUndefined();
		}
	});

	test("the copy offers no reason the model cannot store", () => {
		const expected = Object.values(KEY_OF_REASON).sort();
		expect(shippedKeys(en as Json)).toEqual(expected);
		expect(shippedKeys(fr as Json)).toEqual(expected);
	});
});
