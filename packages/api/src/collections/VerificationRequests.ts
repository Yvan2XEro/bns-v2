import type { Access, CollectionConfig, FieldAccess } from "payload";
import { isAdmin, isModerator } from "../access/roles";

export const VERIFICATION_SERVICE_CONTEXT = {
	verificationService: true,
} as const;

export const VERIFICATION_STATUSES = [
	"draft",
	"submitted",
	"in_review",
	"needs_info",
	"approved",
	"rejected",
	"revoked",
	"expired",
] as const;
export type VerificationStatus = (typeof VERIFICATION_STATUSES)[number];

/** A status where the request still occupies its shop+level slot. */
export const OPEN_STATUSES = [
	"draft",
	"submitted",
	"in_review",
	"needs_info",
] as const;

export const KYC_STATUSES = [
	"not_started",
	"pending",
	"approved",
	"declined",
	"review",
	"abandoned",
	"error",
] as const;

export const REVIEW_SIGNAL_CODES = [
	"identity_reused",
	"name_mismatch",
	"underage",
	"kyc_declined",
	"kyc_review",
	"document_reused",
	"rccm_reused",
	"niu_reused",
	"niu_format",
] as const;
export type ReviewSignalCode = (typeof REVIEW_SIGNAL_CODES)[number];

export const BUSINESS_TYPES = [
	"entreprenant",
	"sole_trader",
	"company",
	"cooperative",
] as const;
export type BusinessType = (typeof BUSINESS_TYPES)[number];

export const REQUEST_INFO_REASONS = [
	"document_unreadable",
	"document_missing",
	"information_inconsistent",
	"kyc_retry",
	"other",
] as const;
export const REJECT_REASONS = [
	"document_invalid",
	"document_expired",
	"identity_mismatch",
	"liveness_failed",
	"business_mismatch",
	"duplicate_identity",
	"fraud_suspected",
	"other",
] as const;
export const REVOKE_REASONS = [
	"fraud",
	"document_forged",
	"business_closed",
	"identity_reused",
	"other",
] as const;

export const LEVEL3_CHECKLIST_ITEMS = [
	"name_matches_registry",
	"registration_number_matches_document",
	"niu_matches_certificate",
	"representative_matches_identity_or_mandate",
	"documents_legible_and_current",
] as const;

const options = <T extends readonly string[]>(values: T) =>
	values.map((value) => ({ label: value, value }));

/** Moderators and admins only. Declared per field so Payload's generic REST obeys it too. */
const reviewerField: FieldAccess = ({ req: { user } }) =>
	isModerator(user as { role?: string } | undefined);

const readAccess: Access = ({ req: { user } }) => {
	if (!user) return false;
	if (isModerator(user as { role?: string })) return true;
	// The owner is always the submitter: a shop's owner is the only account that
	// can open a request, and a transfer of ownership is out of P2's scope.
	return { submittedBy: { equals: user.id } };
};

const closed = () => false;

/**
 * Every write goes through services/verification.ts with `overrideAccess` and
 * `VERIFICATION_SERVICE_CONTEXT`. Nothing — not even an admin in the panel —
 * changes a status by hand, because a status change without its transaction
 * and its moderation-log entry is exactly the audit hole the log exists to
 * close.
 *
 * The `documents` join back from `verification-documents` (Task 3) is added
 * once that collection is registered — a join field referencing an
 * unregistered collection fails Payload's config sanitisation outright.
 */
export const VerificationRequests: CollectionConfig = {
	slug: "verification-requests",
	admin: {
		useAsTitle: "openKey",
		defaultColumns: [
			"shop",
			"requestedLevel",
			"status",
			"assignee",
			"submittedAt",
		],
		hidden: ({ user }) => !isAdmin(user as { role?: string } | undefined),
	},
	access: { read: readAccess, create: closed, update: closed, delete: closed },
	indexes: [
		{ fields: ["status", "submittedAt"] },
		{ fields: ["shop", "requestedLevel", "status"] },
	],
	fields: [
		{
			name: "shop",
			type: "relationship",
			relationTo: "shops",
			required: true,
			index: true,
		},
		{
			name: "requestedLevel",
			type: "number",
			required: true,
			min: 2,
			max: 3,
			admin: { description: "2 = identity, 3 = business." },
		},
		{
			name: "submittedBy",
			type: "relationship",
			relationTo: "users",
			required: true,
			index: true,
		},
		{
			name: "status",
			type: "select",
			required: true,
			defaultValue: "draft",
			index: true,
			options: options(VERIFICATION_STATUSES),
		},
		{
			name: "statusHistory",
			type: "array",
			fields: [
				{
					name: "status",
					type: "select",
					required: true,
					options: options(VERIFICATION_STATUSES),
				},
				{ name: "at", type: "date", required: true },
				{ name: "actor", type: "relationship", relationTo: "users" },
				{
					name: "source",
					type: "select",
					required: true,
					options: options(["seller", "reviewer", "vendor", "system"] as const),
				},
			],
		},
		{
			/**
			 * `{shopId}:{level}` while the request is open, null otherwise. A
			 * partial unique index on the string values (created by the P2
			 * migration) is what makes "one open request per shop and level" a
			 * database invariant rather than a read-then-write race.
			 */
			name: "openKey",
			type: "text",
			index: true,
			admin: { readOnly: true },
		},
		{
			name: "consent",
			type: "group",
			fields: [
				{ name: "acceptedAt", type: "date" },
				{ name: "version", type: "text" },
				{
					name: "locale",
					type: "select",
					options: options(["fr", "en"] as const),
				},
			],
		},
		{
			name: "kyc",
			type: "group",
			admin: {
				description:
					"Level 2 only. No biometric or image data is ever stored here.",
			},
			fields: [
				{
					name: "provider",
					type: "select",
					options: options(["didit", "smileid"] as const),
				},
				{ name: "sessionRef", type: "text", index: true },
				{
					name: "status",
					type: "select",
					defaultValue: "not_started",
					options: options(KYC_STATUSES),
				},
				{ name: "attempts", type: "number", defaultValue: 0 },
				{ name: "decidedAt", type: "date" },
				{
					name: "documentType",
					type: "select",
					options: options([
						"national_id",
						"passport",
						"residence_permit",
					] as const),
				},
				{ name: "documentCountry", type: "text", maxLength: 2 },
				{
					// HMAC-SHA256 of the normalised number under VERIFICATION_HASH_PEPPER.
					// The number itself never reaches the database.
					name: "documentNumberHash",
					type: "text",
					index: true,
					access: { read: reviewerField },
				},
				{ name: "documentNumberLast4", type: "text", maxLength: 4 },
				{ name: "documentExpiresAt", type: "date" },
				{ name: "givenNames", type: "text" },
				{ name: "familyName", type: "text" },
				{
					// Derived from the date of birth, which is never stored.
					name: "adult",
					type: "checkbox",
					defaultValue: false,
				},
				{ name: "livenessPassed", type: "checkbox", defaultValue: false },
				{
					name: "faceMatchScore",
					type: "number",
					min: 0,
					max: 100,
					access: { read: reviewerField },
				},
				{
					name: "vendorWarnings",
					type: "json",
					access: { read: reviewerField },
				},
				{
					name: "vendorReviewUrl",
					type: "text",
					access: { read: reviewerField },
				},
				{ name: "vendorDataDeletedAt", type: "date" },
			],
		},
		{
			name: "business",
			type: "group",
			admin: { description: "Level 3 only." },
			fields: [
				{
					name: "businessType",
					type: "select",
					options: options(BUSINESS_TYPES),
				},
				{ name: "legalName", type: "text", maxLength: 120 },
				{ name: "tradeName", type: "text", maxLength: 120 },
				{ name: "rccmNumber", type: "text", maxLength: 40, index: true },
				{
					name: "entreprenantDeclarationNumber",
					type: "text",
					maxLength: 40,
					index: true,
				},
				{ name: "niu", type: "text", maxLength: 14, index: true },
				{ name: "registeredAddress", type: "textarea", maxLength: 500 },
				{ name: "city", type: "text", maxLength: 80 },
				{ name: "legalRepresentativeName", type: "text", maxLength: 120 },
				{
					name: "legalRepresentativeIsOwner",
					type: "checkbox",
					defaultValue: true,
				},
			],
		},
		{
			name: "reviewSignals",
			type: "array",
			access: { read: reviewerField },
			fields: [
				{
					name: "code",
					type: "select",
					required: true,
					options: options(REVIEW_SIGNAL_CODES),
				},
				{ name: "detail", type: "text" },
				{
					name: "relatedRequest",
					type: "relationship",
					relationTo: "verification-requests",
				},
			],
		},
		{
			name: "assignee",
			type: "relationship",
			relationTo: "users",
			index: true,
			access: { read: reviewerField },
		},
		{ name: "claimedAt", type: "date", access: { read: reviewerField } },
		{
			name: "infoRequests",
			type: "array",
			fields: [
				{
					name: "reasonCode",
					type: "select",
					required: true,
					options: options(REQUEST_INFO_REASONS),
				},
				{ name: "message", type: "textarea", required: true },
				{
					name: "requestedBy",
					type: "relationship",
					relationTo: "users",
					access: { read: reviewerField },
				},
				{ name: "requestedAt", type: "date", required: true },
				{ name: "respondedAt", type: "date" },
			],
		},
		{
			name: "decision",
			type: "group",
			fields: [
				{
					name: "decidedBy",
					type: "relationship",
					relationTo: "users",
					access: { read: reviewerField },
				},
				{ name: "decidedAt", type: "date" },
				{ name: "reasonCode", type: "text" },
				{ name: "sellerMessage", type: "textarea" },
				{
					name: "internalNote",
					type: "textarea",
					access: { read: reviewerField },
				},
				{ name: "checklist", type: "json", access: { read: reviewerField } },
			],
		},
		{ name: "submittedAt", type: "date", index: true },
		{ name: "approvedAt", type: "date" },
		{ name: "expiresAt", type: "date", index: true },
		{ name: "revokedAt", type: "date" },
		{
			name: "supersedes",
			type: "relationship",
			relationTo: "verification-requests",
		},
		{
			name: "previousRequest",
			type: "relationship",
			relationTo: "verification-requests",
		},
	],
	timestamps: true,
};
