import { describe, expect, it } from "vitest";
import { VERIFICATION_STATUSES } from "../../src/collections/VerificationRequests";
import {
	canTransition,
	isOpen,
	isTerminal,
	logActionFor,
	nextStatus,
	TRANSITIONS,
} from "../../src/lib/verificationTransitions";

/** The spec's transition table, as data, so the test says what the product does. */
const ALLOWED: [string, string, string, string | null][] = [
	["submit", "draft", "submitted", null],
	["claim", "submitted", "in_review", "verification.claim"],
	["release", "in_review", "submitted", "verification.release"],
	["request_info", "in_review", "needs_info", "verification.request_info"],
	["approve", "in_review", "approved", "verification.approve"],
	["auto_approve", "submitted", "approved", "verification.approve"],
	["reject", "in_review", "rejected", "verification.reject"],
	["resubmit", "needs_info", "submitted", null],
	["revoke", "approved", "revoked", "verification.revoke"],
	["expire", "draft", "expired", "verification.expire"],
	// A shop-closed cascade must be able to expire a request already past
	// `draft` — still waiting on a reviewer, not just one the idle sweep
	// would have caught — so `expire` also reaches from `submitted` and
	// `in_review`, not only the statuses the idle/no-response/lapsed causes
	// use on their own.
	["expire", "submitted", "expired", "verification.expire"],
	["expire", "in_review", "expired", "verification.expire"],
	["expire", "needs_info", "expired", "verification.expire"],
	["expire", "approved", "expired", "verification.expire"],
];

describe("verification transition table", () => {
	it.each(ALLOWED)("allows %s from %s to %s", (name, from, to, action) => {
		expect(canTransition(name as never, from as never)).toBe(true);
		expect(nextStatus(name as never)).toBe(to);
		expect(logActionFor(name as never)).toBe(action);
	});

	it("forbids every from/name pair the table does not list", () => {
		const allowed = new Set(ALLOWED.map(([name, from]) => `${name}:${from}`));
		for (const name of Object.keys(TRANSITIONS)) {
			for (const from of VERIFICATION_STATUSES) {
				if (name === "open") continue;
				expect(canTransition(name as never, from), `${name} from ${from}`).toBe(
					allowed.has(`${name}:${from}`),
				);
			}
		}
	});

	it("lets nothing leave a terminal status", () => {
		for (const from of ["rejected", "revoked", "expired"] as const) {
			expect(isTerminal(from)).toBe(true);
			for (const name of Object.keys(TRANSITIONS)) {
				expect(canTransition(name as never, from), `${name} from ${from}`).toBe(
					false,
				);
			}
		}
	});

	it("names the four statuses that hold a shop+level slot open", () => {
		expect(VERIFICATION_STATUSES.filter(isOpen)).toEqual([
			"draft",
			"submitted",
			"in_review",
			"needs_info",
		]);
	});

	it("attributes each transition to the right source", () => {
		expect(TRANSITIONS.submit.by).toBe("seller");
		expect(TRANSITIONS.approve.by).toBe("reviewer");
		expect(TRANSITIONS.auto_approve.by).toBe("system");
		expect(TRANSITIONS.expire.by).toBe("system");
	});
});
