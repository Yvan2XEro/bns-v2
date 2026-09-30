import { describe, expect, it } from "vitest";
import {
	MODERATION_ACTIONS,
	ModerationLog,
} from "../../src/collections/ModerationLog";
import { Shops } from "../../src/collections/Shops";
import { Users } from "../../src/collections/Users";
import {
	LEVEL3_CHECKLIST_ITEMS,
	VERIFICATION_STATUSES,
	VerificationRequests,
} from "../../src/collections/VerificationRequests";

type Field = {
	name?: string;
	type?: string;
	fields?: Field[];
	access?: { read?: unknown };
	required?: boolean;
	validate?: unknown;
};

const field = (fields: Field[], name: string): Field | undefined =>
	fields.find((f) => f.name === name);

const OWNER = { req: { user: { id: "u-1", role: "user" } } };
const MOD = { req: { user: { id: "m-1", role: "moderator" } } };
const ADMIN = { req: { user: { id: "a-1", role: "admin" } } };

/**
 * The reviewer-only fields. P1 shipped a shaped endpoint that was correct
 * while Payload's generic REST beside it returned the same field, so this
 * asserts the field-level rule the generic route also obeys — not the shape
 * of any one handler.
 */
const REVIEWER_ONLY = ["reviewSignals", "assignee", "claimedAt"] as const;

describe("verification-requests access", () => {
	it("is closed to every client for create, update and delete", () => {
		for (const op of ["create", "update", "delete"] as const) {
			const access = VerificationRequests.access?.[op];
			expect(typeof access).toBe("function");
			for (const ctx of [OWNER, MOD, ADMIN]) {
				expect((access as (a: unknown) => unknown)(ctx)).toBe(false);
			}
		}
	});

	it("lets a moderator read everything and an owner only their own shop's requests", () => {
		const read = VerificationRequests.access?.read as (a: unknown) => unknown;
		expect(read(MOD)).toBe(true);
		expect(read({ req: { user: null } })).toBe(false);
		expect(read(OWNER)).toEqual({ submittedBy: { equals: "u-1" } });
	});

	it("keeps every reviewer-only field unreadable to the owner", () => {
		const fields = VerificationRequests.fields as Field[];
		for (const name of REVIEWER_ONLY) {
			const read = field(fields, name)?.access?.read as
				| ((a: unknown) => boolean)
				| undefined;
			expect(read, `${name} must declare a field-level read`).toBeTypeOf(
				"function",
			);
			expect(read?.(OWNER)).toBe(false);
			expect(read?.(MOD)).toBe(true);
		}
	});

	it("keeps the internal kyc and decision fields unreadable to the owner", () => {
		const fields = VerificationRequests.fields as Field[];
		const kyc = field(fields, "kyc")?.fields ?? [];
		for (const name of [
			"documentNumberHash",
			"faceMatchScore",
			"vendorWarnings",
			"vendorReviewUrl",
		]) {
			expect(
				(field(kyc, name)?.access?.read as (a: unknown) => boolean)(OWNER),
			).toBe(false);
		}
		const decision = field(fields, "decision")?.fields ?? [];
		for (const name of ["internalNote", "checklist"]) {
			expect(
				(field(decision, name)?.access?.read as (a: unknown) => boolean)(OWNER),
			).toBe(false);
		}
	});

	it("hides the collection from the admin panel for non-admins", () => {
		const hidden = VerificationRequests.admin?.hidden as
			| ((a: unknown) => boolean)
			| boolean;
		expect(
			typeof hidden === "function"
				? hidden({ user: { role: "moderator" } })
				: hidden,
		).toBe(true);
	});

	it("declares every status and checklist item the service machine uses", () => {
		expect(VERIFICATION_STATUSES).toEqual([
			"draft",
			"submitted",
			"in_review",
			"needs_info",
			"approved",
			"rejected",
			"revoked",
			"expired",
		]);
		expect(LEVEL3_CHECKLIST_ITEMS).toEqual([
			"name_matches_registry",
			"registration_number_matches_document",
			"niu_matches_certificate",
			"representative_matches_identity_or_mandate",
			"documents_legible_and_current",
		]);
	});
});

describe("moderation-log", () => {
	it("knows every verification action and the new target type", () => {
		for (const action of [
			"verification.claim",
			"verification.release",
			"verification.request_info",
			"verification.approve",
			"verification.reject",
			"verification.revoke",
			"verification.expire",
		]) {
			expect(MODERATION_ACTIONS).toContain(action);
		}
		const targetType = (ModerationLog.fields as Field[]).find(
			(f) => f.name === "targetType",
		) as { options: { value: string }[] };
		expect(targetType.options.map((o) => o.value)).toContain(
			"verification-request",
		);
	});

	it("requires an actor unless the entry is a system one", () => {
		const actor = (ModerationLog.fields as Field[]).find(
			(f) => f.name === "actor",
		);
		expect(actor?.required).toBeFalsy();
		const validate = actor?.validate as (
			v: unknown,
			o: { siblingData: { actorRole?: string } },
		) => true | string;
		expect(validate(null, { siblingData: { actorRole: "system" } })).toBe(true);
		expect(validate("u-1", { siblingData: { actorRole: "moderator" } })).toBe(
			true,
		);
		expect(
			validate(null, { siblingData: { actorRole: "moderator" } }),
		).toBeTypeOf("string");
	});
});

describe("shops and users field additions", () => {
	it("adds the service-owned level fields to shops and pins them", () => {
		const names = (Shops.fields as Field[]).map((f) => f.name);
		expect(names).toEqual(
			expect.arrayContaining(["levelExpiresAt", "verifiedAt", "legal"]),
		);
		const legal =
			(Shops.fields as Field[]).find((f) => f.name === "legal")?.fields ?? [];
		expect(legal.map((f) => f.name)).toEqual([
			"businessType",
			"legalName",
			"rccmNumber",
			"niu",
			"verifiedAt",
		]);
	});

	it("adds the identity fields to users with the right readers", () => {
		const fields = Users.fields as Field[];
		expect(field(fields, "identityVerifiedAt")).toBeDefined();
		expect(field(fields, "identityVerification")).toBeDefined();
		const legacy = field(fields, "legacyVerifiedAt");
		expect((legacy?.access?.read as (a: unknown) => boolean)(MOD)).toBe(false);
		expect((legacy?.access?.read as (a: unknown) => boolean)(ADMIN)).toBe(true);
	});
});
