import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { Glob } from "bun";
import en from "./en.json";
import fr from "./fr.json";

type Json = { [key: string]: Json | string };

function leafPaths(node: Json, prefix = ""): string[] {
	return Object.entries(node).flatMap(([key, value]) => {
		const path = prefix ? `${prefix}.${key}` : key;
		return typeof value === "string" ? [path] : leafPaths(value, path);
	});
}

function getPath(node: Json, path: string): Json | string | undefined {
	return path
		.split(".")
		.reduce<Json | string | undefined>(
			(acc, key) => (acc && typeof acc === "object" ? acc[key] : undefined),
			node,
		);
}

/**
 * Pre-existing drift, measured on 2026-10-01 after fixing the mobile i18n
 * defect this task was about (`boostHistory`, `safety`, `savedSearches`,
 * part of `listing`, and a handful of validator-message keys were missing
 * from English only): 2 keys exist only in English, 5 only in French, none
 * of them reachable from a `t(...)` call (see the "called keys" test below)
 * — they are translated strings nothing in the app currently asks for. This
 * gate does not demand that backlog be cleared either. It pins today's count
 * as a ceiling that must not rise, the same way the mobile type-error count
 * is a ceiling in `AGENTS.md`: a real fix lowers the number and the constant
 * below drops with it; a new screen that forgets a translation raises the
 * count and fails here instead of shipping silently.
 */
const PRE_EXISTING_ONLY_EN_CEILING = 2;
const PRE_EXISTING_ONLY_FR_CEILING = 5;

const SRC_ROOT = join(import.meta.dir, "..");
const APP_ROOT = join(import.meta.dir, "../../app");

/**
 * `t(` reached through two shapes in this codebase: a literal/template call
 * (`t("ns.key")`, `t(\`ns.key\`)`) and a zod validator whose `message` or
 * `.regex(..., message)` string IS the translation key, later rendered with
 * `t(errors.field.message)` (`decisionSheetForm.ts`, `shopLegal.ts`,
 * `useIdentityConsentForm.ts`) — those never appear as a `t(` call at all,
 * which is how four of this task's 66 missing keys went unnoticed by a
 * grep for `t(` literals alone.
 *
 * A template literal built from a runtime value (`t(\`moderation.verifStatus_${status}\`)`)
 * is read only for its static prefix, which this intentionally fails to
 * resolve to a full key and so never adds to the set below. Those ~70 call
 * sites stay a manual-review concern; what this function buys is a hard
 * floor under the >1100 keys that aren't.
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
 * The actual defect this task fixes: a key that's absent from BOTH files
 * passes every check above (parity and namespace presence don't require a
 * key to exist at all), and that's exactly how `boostHistory` and
 * `currency.xaf` went unnoticed. Measured today, right after fixing every
 * key this found: 0. The ceiling must come down with a real fix and never
 * rise — a new screen calling a key nobody wrote fails here before it ships.
 */
const CALLED_KEY_MISSING_CEILING = 0;

/**
 * `apiError.locales.test.ts` guards the error codes. This guards everything
 * else: a string added to one language and forgotten in the other renders its
 * raw key path to half the users, which is how `filters.verified` sat
 * untranslated for a phase.
 */
describe("locale parity", () => {
	test("the pre-existing en/fr backlog does not grow", () => {
		const enKeys = leafPaths(en as Json).sort();
		const frKeys = leafPaths(fr as Json).sort();
		const onlyEn = enKeys.filter((key) => !frKeys.includes(key));
		const onlyFr = frKeys.filter((key) => !enKeys.includes(key));
		expect(onlyEn.length).toBeLessThanOrEqual(PRE_EXISTING_ONLY_EN_CEILING);
		expect(onlyFr.length).toBeLessThanOrEqual(PRE_EXISTING_ONLY_FR_CEILING);
	});

	test("every P3 namespace is in exact en/fr lockstep", () => {
		// The backlog ceiling above tolerates old drift; a namespace this phase
		// introduced gets no such allowance; it must match exactly today.
		for (const namespace of ["team", "invite", "inbox", "shopActivity"]) {
			const enNs = leafPaths((en as Json)[namespace] as Json).sort();
			const frNs = leafPaths((fr as Json)[namespace] as Json).sort();
			expect(frNs).toEqual(enNs);
		}
	});

	test("every P3 namespace exists in both", () => {
		for (const namespace of ["team", "invite", "inbox", "shopActivity"]) {
			expect(Object.keys(en as Json)).toContain(namespace);
			expect(Object.keys(fr as Json)).toContain(namespace);
		}
	});

	test("every one of the twenty-four activity actions is translated in both", () => {
		const actions = (node: Json) =>
			Object.keys(((node.shopActivity as Json).actions as Json) ?? {});
		expect(actions(en as Json)).toHaveLength(24);
		expect(actions(fr as Json).sort()).toEqual(actions(en as Json).sort());
	});

	/**
	 * Pins the server's own vocabulary, not just a key name: the six inbox
	 * filters in the server's own order (`INBOX_FILTERS` in
	 * `packages/mobile/src/types/api.ts`, itself mirroring the API) and the
	 * three shop roles named consistently across the `team` and
	 * `shopActivity` namespaces — a client-side rename or reorder of either
	 * is exactly the kind of divergence this gate exists to catch.
	 */
	test("the inbox exposes the server's six filters, in order", () => {
		const inboxKeys = Object.keys((en as Json).inbox as Json);
		const filterKeys = inboxKeys.filter((key) => key.startsWith("filter_"));
		expect(filterKeys).toEqual([
			"filter_all",
			"filter_unassigned",
			"filter_mine",
			"filter_unread",
			"filter_awaiting",
			"filter_done",
		]);
	});

	test("the three shop roles are named the same way in team and shopActivity", () => {
		for (const key of ["roleOwner", "roleManager", "roleStaff"]) {
			expect(en as Json).toHaveProperty(`team.${key}`);
			expect(fr as Json).toHaveProperty(`team.${key}`);
		}
		const activityRoles = Object.keys(
			((en as Json).shopActivity as Json).roles as Json,
		).sort();
		expect(activityRoles).toEqual(["manager", "owner", "staff", "system"]);
	});

	test("every key the code calls exists in both en and fr", () => {
		const files = [...listSourceFiles(SRC_ROOT), ...listSourceFiles(APP_ROOT)];
		const calledKeys = extractCalledKeys(files);
		expect(calledKeys.size).toBeGreaterThan(1000);

		const missingEn = [...calledKeys].filter(
			(key) => getPath(en as Json, key) === undefined,
		);
		const missingFr = [...calledKeys].filter(
			(key) => getPath(fr as Json, key) === undefined,
		);
		expect(missingEn.length).toBeLessThanOrEqual(CALLED_KEY_MISSING_CEILING);
		expect(missingFr.length).toBeLessThanOrEqual(CALLED_KEY_MISSING_CEILING);
	});

	test("no string is left identical in both languages by accident in the P3 namespaces", () => {
		// Proper nouns and format strings legitimately match; a whole namespace
		// matching means one language was pasted over the other.
		for (const namespace of ["team", "invite", "inbox"]) {
			const enLeaves = leafPaths((en as Json)[namespace] as Json);
			const identical = enLeaves.filter((path) => {
				const read = (node: Json) =>
					path
						.split(".")
						.reduce<Json | string | undefined>(
							(acc, key) =>
								acc && typeof acc === "object" ? acc[key] : undefined,
							node,
						);
				return (
					read((en as Json)[namespace] as Json) ===
					read((fr as Json)[namespace] as Json)
				);
			});
			expect(identical.length).toBeLessThan(enLeaves.length);
		}
	});

	/**
	 * Task 7's P4 namespaces: `orderStatus`, `cart`, `checkout`, `purchases`,
	 * `sellerOrders` and `billing` land here as a block, the same
	 * silent-drift shape as the P3 namespaces above.
	 */
	const P4_NAMESPACES = [
		"orderStatus",
		"cart",
		"checkout",
		"purchases",
		"sellerOrders",
		"billing",
	];

	test("every P4 namespace is in exact en/fr lockstep", () => {
		for (const namespace of P4_NAMESPACES) {
			const enNs = leafPaths(((en as Json)[namespace] ?? {}) as Json).sort();
			const frNs = leafPaths(((fr as Json)[namespace] ?? {}) as Json).sort();
			expect(frNs).toEqual(enNs);
		}
	});

	// Deliberately no "every P4 namespace exists in both" test here: a
	// namespace absent from BOTH files satisfies en/fr lockstep perfectly,
	// which is exactly the blind spot `locales/keys.test.ts` exists to cover
	// with a hard-coded manifest instead — see its "every key Task 7
	// promised exists" test and Task 7's report for the mutation that
	// proves the split (deleting `billing` from both files leaves this file
	// green and fails that one).

	/**
	 * The status vocabulary itself, pinned in full: the eleven statuses times
	 * two audiences give 22 cells (some seller keys repeat — `confirmed` and
	 * `paid` share `status_placed_seller`, `completed` shares
	 * `status_delivered_seller` — so this list has 22 entries but fewer than
	 * 22 distinct key names), the six tabs, and the six delivery-failure
	 * reasons. This is the hard-coded half of the computed-family guard:
	 * `locales/keys.test.ts` scans for literal `t("...")` calls, which can
	 * never see `t(statusLabelKey(status, audience))` — a key chosen at
	 * runtime from this very table.
	 */
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

	test("the computed-key families have the sizes the code assumes", () => {
		expect(STATUS_KEYS).toHaveLength(22);
		expect(TAB_KEYS).toHaveLength(6);
		expect(FAILURE_REASON_KEYS).toHaveLength(6);
		expect(CANCEL_REASON_KEYS).toHaveLength(2);
		expect(TIER_KEYS).toHaveLength(4);
	});

	test("every computed-family key exists in both locales", () => {
		for (const key of STATUS_KEYS.concat(TAB_KEYS, FAILURE_REASON_KEYS)) {
			expect((en as Json).orderStatus).toHaveProperty(key);
			expect((fr as Json).orderStatus).toHaveProperty(key);
		}
		for (const key of CANCEL_REASON_KEYS) {
			expect((en as Json).purchases).toHaveProperty(key);
			expect((fr as Json).purchases).toHaveProperty(key);
		}
		for (const key of TIER_KEYS) {
			expect((en as Json).sellerOrders).toHaveProperty(key);
			expect((fr as Json).sellerOrders).toHaveProperty(key);
		}
	});

	test("no string is left identical in both languages by accident in the P4 namespaces", () => {
		for (const namespace of P4_NAMESPACES) {
			const enNode = ((en as Json)[namespace] ?? {}) as Json;
			const frNode = ((fr as Json)[namespace] ?? {}) as Json;
			const enLeaves = leafPaths(enNode);
			// A namespace absent from both sides has nothing to compare — that
			// is a presence problem, and `locales/keys.test.ts` is the gate
			// that owns it, not this one.
			if (enLeaves.length === 0) continue;
			const identical = enLeaves.filter((path) => {
				const read = (node: Json) =>
					path
						.split(".")
						.reduce<Json | string | undefined>(
							(acc, key) =>
								acc && typeof acc === "object" ? acc[key] : undefined,
							node,
						);
				return read(enNode) === read(frNode);
			});
			expect(identical.length).toBeLessThan(enLeaves.length);
		}
	});
});
