import { describe, expect, it } from "bun:test";
import {
	availableActions,
	CHECKLIST_ITEMS,
	checklistComplete,
	type DecisionFormValues,
	decisionSchema,
	documentUrlIsStale,
} from "./verification-decision";

const viewer = (over = {}) => ({
	canClaim: false,
	canDecide: false,
	isAssignee: false,
	isAdmin: false,
	conflictOfInterest: false,
	...over,
});

describe("availableActions", () => {
	it("reads the permission the API states, never a value being present", () => {
		// P1 shipped a client that inferred a permission from whether a field was
		// there. The viewer block is the authority; `assignee` is only display.
		expect(availableActions(viewer({ canClaim: true }), "submitted")).toEqual([
			"claim",
		]);
		expect(
			availableActions(
				viewer({ canDecide: true, isAssignee: true }),
				"in_review",
			),
		).toEqual(["release", "request_info", "approve", "reject"]);
	});

	it("offers nothing to a reviewer with a conflict of interest", () => {
		expect(
			availableActions(
				viewer({ canClaim: true, conflictOfInterest: true }),
				"submitted",
			),
		).toEqual([]);
	});

	it("offers revoke on an approved request to anyone who may decide", () => {
		expect(availableActions(viewer({ canDecide: true }), "approved")).toEqual([
			"revoke",
		]);
	});

	it("offers nothing on a terminal request", () => {
		for (const status of ["rejected", "revoked", "expired"]) {
			expect(
				availableActions(
					viewer({ canDecide: true, isAdmin: true }),
					status as never,
				),
			).toEqual([]);
		}
	});
});

describe("decisionSchema", () => {
	// Every action validates the same three fields, because the dialog always
	// renders the same three; what differs is which of them the action demands.
	const values = (
		over: Partial<DecisionFormValues> = {},
	): DecisionFormValues => ({
		reasonCode: "",
		sellerMessage: "",
		note: "",
		...over,
	});

	it("requires a reason and a seller message to reject or request info", () => {
		expect(decisionSchema("reject").safeParse(values()).success).toBe(false);
		expect(
			decisionSchema("reject").safeParse(
				values({ reasonCode: "document_expired", sellerMessage: "Expired." }),
			).success,
		).toBe(true);
		expect(
			decisionSchema("request_info").safeParse(
				values({ reasonCode: "document_missing" }),
			).success,
		).toBe(false);
	});

	it("refuses a reason code the API does not accept for that action", () => {
		expect(
			decisionSchema("reject").safeParse(
				values({ reasonCode: "business_closed", sellerMessage: "No." }),
			).success,
		).toBe(false);
	});

	it("requires only a reason to revoke", () => {
		expect(
			decisionSchema("revoke").safeParse(values({ reasonCode: "fraud" }))
				.success,
		).toBe(true);
		expect(decisionSchema("revoke").safeParse(values()).success).toBe(false);
	});

	it("requires nothing to claim or release", () => {
		expect(decisionSchema("claim").safeParse(values()).success).toBe(true);
		expect(decisionSchema("release").safeParse(values()).success).toBe(true);
	});
});

describe("checklistComplete", () => {
	it("names the five items", () => {
		expect(CHECKLIST_ITEMS).toEqual([
			"name_matches_registry",
			"registration_number_matches_document",
			"niu_matches_certificate",
			"representative_matches_identity_or_mandate",
			"documents_legible_and_current",
		]);
	});

	it("is complete only when every item is true", () => {
		const all = Object.fromEntries(CHECKLIST_ITEMS.map((k) => [k, true]));
		expect(checklistComplete(all)).toBe(true);
		expect(checklistComplete({ ...all, niu_matches_certificate: false })).toBe(
			false,
		);
		expect(checklistComplete({})).toBe(false);
	});
});

describe("documentUrlIsStale", () => {
	it("is stale at and past the expiry, and a few seconds before it", () => {
		const now = new Date("2026-10-02T12:00:00.000Z");
		expect(documentUrlIsStale("2026-10-02T12:00:00.000Z", now)).toBe(true);
		expect(documentUrlIsStale("2026-10-02T12:00:03.000Z", now)).toBe(true);
		expect(documentUrlIsStale("2026-10-02T12:00:30.000Z", now)).toBe(false);
	});
});
