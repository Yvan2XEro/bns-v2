import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * `NotMeBanner` posts `/payout-accounts/{accountId}/not-me` — reporting
 * fraud on the shop's own payout account. The setup page reaches it with
 * `?shop=&notMe=` straight from the SMS link, and most carriers and
 * messaging apps fetch a link to generate a preview before anyone opens it.
 * If that POST fired on render, every legitimate payout-account change would
 * report itself as fraud before the owner ever saw the page.
 *
 * Neither package has a component-render harness (AGENTS.md), so this pins
 * the property at the source level, the same technique
 * `messages-keys.test.ts` already uses for a different invariant: the
 * mutation call must exist (proving the path is reachable at all — the
 * "paired positive assertion" the project's testing rule asks for) and it
 * must appear nowhere but inside the button's own `onClick`, with no
 * `useEffect` anywhere in the file to smuggle it back onto the render path.
 */
const SOURCE = readFileSync(join(import.meta.dir, "not-me-banner.tsx"), "utf8");

describe("NotMeBanner never fires its mutation on render", () => {
	test("calls reportNotMe.mutate exactly once in the whole file", () => {
		const occurrences = SOURCE.match(/reportNotMe\.mutate\(/g) ?? [];
		expect(occurrences).toHaveLength(1);
	});

	test("that one call sits inside the confirm button's onClick, not an effect", () => {
		const onClickIndex = SOURCE.indexOf("onClick={() => {");
		const mutateIndex = SOURCE.indexOf("reportNotMe.mutate(");
		expect(onClickIndex).toBeGreaterThan(-1);
		expect(mutateIndex).toBeGreaterThan(onClickIndex);
		// Nothing closes the onClick handler between the two.
		const between = SOURCE.slice(onClickIndex, mutateIndex);
		expect(between).not.toContain("}}");
	});

	test("the file declares no effect that could run the mutation on mount", () => {
		expect(SOURCE).not.toContain("useEffect");
	});
});
