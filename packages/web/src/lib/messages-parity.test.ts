import { describe, expect, test } from "bun:test";
import en from "~/../messages/en.json";
import fr from "~/../messages/fr.json";

type Json = { [key: string]: Json | string };

function leafPaths(node: Json, prefix = ""): string[] {
	return Object.entries(node).flatMap(([key, value]) => {
		const path = prefix ? `${prefix}.${key}` : key;
		return typeof value === "string" ? [path] : leafPaths(value, path);
	});
}

/**
 * Pre-existing drift, measured before this task touched a single key: 0 keys
 * exist only in English, 1 only in French (`Search.conditionCorrect`). It
 * predates P3, so this gate does not demand it be cleared — it pins today's
 * count as a ceiling that must not rise, the same way mobile's locale backlog
 * and the type-error counts in `AGENTS.md` are ceilings: a real fix lowers
 * the number and the constant below drops with it; a new screen that forgets
 * a translation raises the count and fails here instead of shipping with a
 * raw key visible to half its users.
 */
const PRE_EXISTING_ONLY_EN_CEILING = 0;
const PRE_EXISTING_ONLY_FR_CEILING = 1;

/**
 * Web's twin of `packages/mobile/src/locales/parity.test.ts`. `Team`,
 * `Invite` and `shopActivity` landed in `messages/{en,fr}.json` as part of
 * this task — their components already called `useTranslations("Team")` and
 * friends before either namespace existed in these files at all, which is
 * exactly the silent-drift failure mode this test exists to catch.
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
		for (const namespace of ["Team", "Invite", "Inbox", "shopActivity"]) {
			const enNs = leafPaths((en as Json)[namespace] as Json).sort();
			const frNs = leafPaths((fr as Json)[namespace] as Json).sort();
			expect(frNs).toEqual(enNs);
		}
	});

	test("every P3 namespace exists in both", () => {
		for (const namespace of ["Team", "Invite", "Inbox", "shopActivity"]) {
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
	 * filters and the role/permission words both clients must use the exact
	 * same six (and the same three roles) for — the server has one answer for
	 * each, so a client-side rename or reorder here is the kind of drift this
	 * whole gate exists to stop.
	 */
	test("the inbox exposes the server's six filters, in order", () => {
		const inboxKeys = Object.keys((en as Json).Inbox as Json);
		const filterKeys = inboxKeys.filter((key) => key.startsWith("filter"));
		expect(filterKeys).toEqual([
			"filterAll",
			"filterUnassigned",
			"filterMine",
			"filterUnread",
			"filterAwaiting",
			"filterDone",
		]);
	});

	test("the three shop roles are named the same way in Team and shopActivity", () => {
		const teamRoleKeys = ["roleOwner", "roleManager", "roleStaff"];
		for (const key of teamRoleKeys) {
			expect((en as Json).Team).toHaveProperty(key);
			expect((fr as Json).Team).toHaveProperty(key);
		}
		const activityRoles = Object.keys(
			((en as Json).shopActivity as Json).roles as Json,
		).sort();
		expect(activityRoles).toEqual(["manager", "owner", "staff", "system"]);
	});

	test("no string is left identical in both languages by accident in the P3 namespaces", () => {
		// Proper nouns and format strings legitimately match; a whole namespace
		// matching means one language was pasted over the other.
		for (const namespace of ["Team", "Invite", "Inbox"]) {
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
