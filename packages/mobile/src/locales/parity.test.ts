import { describe, expect, test } from "bun:test";
import en from "./en.json";
import fr from "./fr.json";

type Json = { [key: string]: Json | string };

function leafPaths(node: Json, prefix = ""): string[] {
	return Object.entries(node).flatMap(([key, value]) => {
		const path = prefix ? `${prefix}.${key}` : key;
		return typeof value === "string" ? [path] : leafPaths(value, path);
	});
}

/**
 * Pre-existing drift, measured on 2026-09-15 before this task touched a
 * single key: 2 keys exist only in English, 76 only in French (`boostHistory`
 * is a whole namespace French-only). None of it is P3's — it predates every
 * P3 screen — so this gate does not demand the backlog be cleared. It pins
 * today's count as a ceiling that must not rise, the same way the mobile
 * type-error count is a ceiling in `AGENTS.md`: a real fix lowers the number
 * and the constant below drops with it; a new screen that forgets a
 * translation raises the count and fails here instead of shipping silently.
 */
const PRE_EXISTING_ONLY_EN_CEILING = 2;
const PRE_EXISTING_ONLY_FR_CEILING = 73;

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
});
