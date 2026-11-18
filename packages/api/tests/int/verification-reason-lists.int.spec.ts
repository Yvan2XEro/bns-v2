import { describe, expect, it } from "vitest";
import {
	REJECT_REASONS as mobileRejectReasons,
	REQUEST_INFO_REASONS as mobileRequestInfoReasons,
	REVOKE_REASONS as mobileRevokeReasons,
} from "../../../mobile/src/lib/moderationVerification";
import { CHECKLIST_ITEMS as mobileChecklistItems } from "../../../mobile/src/lib/verification";
import {
	LEVEL3_CHECKLIST_ITEMS as webChecklistItems,
	REJECT_REASONS as webRejectReasons,
	REQUEST_INFO_REASONS as webRequestInfoReasons,
	REVOKE_REASONS as webRevokeReasons,
} from "../../../web/src/lib/verification";
import {
	LEVEL3_CHECKLIST_ITEMS,
	REJECT_REASONS,
	REQUEST_INFO_REASONS,
	REVOKE_REASONS,
} from "../../src/collections/VerificationRequests";

/**
 * The API's reason lists and level-3 checklist are hand-mirrored in both
 * clients (`packages/web/src/lib/verification.ts`,
 * `packages/mobile/src/lib/verification.ts` and
 * `packages/mobile/src/lib/moderationVerification.ts`) rather than imported,
 * because a client importing `collections/VerificationRequests.ts` directly
 * drags a Payload collection — and the `payload` type surface it depends on —
 * into a client's own type-check, where it does not resolve the same way it
 * does here.
 *
 * This file runs the other direction instead: it is API code, so it imports
 * the client mirrors into ITS OWN type-check and compares them against the
 * real, single source of truth at runtime. A test that pinned a second,
 * hand-typed copy of each list (what `verification.test.ts` used to do, in
 * both clients) only proved that copy matched itself — editing the API's own
 * list left it green. This one fails for real: change a reason code, a
 * checklist item, or their order in `collections/VerificationRequests.ts`
 * without updating every client mirror, and the corresponding assertion
 * below fails.
 */
describe("reason lists and checklist stay in sync with the API's canonical copy", () => {
	it("REQUEST_INFO_REASONS", () => {
		expect(webRequestInfoReasons).toEqual(REQUEST_INFO_REASONS);
		expect(mobileRequestInfoReasons).toEqual(REQUEST_INFO_REASONS);
	});

	it("REJECT_REASONS", () => {
		expect(webRejectReasons).toEqual(REJECT_REASONS);
		expect(mobileRejectReasons).toEqual(REJECT_REASONS);
	});

	it("REVOKE_REASONS", () => {
		expect(webRevokeReasons).toEqual(REVOKE_REASONS);
		expect(mobileRevokeReasons).toEqual(REVOKE_REASONS);
	});

	it("LEVEL3_CHECKLIST_ITEMS", () => {
		expect(webChecklistItems).toEqual(LEVEL3_CHECKLIST_ITEMS);
		expect(mobileChecklistItems).toEqual(LEVEL3_CHECKLIST_ITEMS);
	});
});
