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
			type: "row",
			fields: [
				{
					name: "shop",
					type: "relationship",
					relationTo: "shops",
					required: true,
					index: true,
					admin: { width: "33%" },
				},
				{
					name: "requestedLevel",
					type: "number",
					required: true,
					min: 2,
					max: 3,
					admin: { width: "33%", description: "2 = identity, 3 = business." },
				},
				{
					name: "submittedBy",
					type: "relationship",
					relationTo: "users",
					required: true,
					index: true,
					admin: { width: "33%" },
				},
			],
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
					type: "row",
					fields: [
						{
							name: "status",
							type: "select",
							required: true,
							options: options(VERIFICATION_STATUSES),
							admin: { width: "25%" },
						},
						{
							name: "at",
							type: "date",
							required: true,
							admin: { width: "25%" },
						},
						{
							name: "actor",
							type: "relationship",
							relationTo: "users",
							admin: { width: "25%" },
						},
						{
							name: "source",
							type: "select",
							required: true,
							options: options([
								"seller",
								"reviewer",
								"vendor",
								"system",
							] as const),
							admin: { width: "25%" },
						},
					],
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
				{
					type: "row",
					fields: [
						{ name: "acceptedAt", type: "date", admin: { width: "33%" } },
						{ name: "version", type: "text", admin: { width: "33%" } },
						{
							name: "locale",
							type: "select",
							options: options(["fr", "en"] as const),
							admin: { width: "33%" },
						},
					],
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
					type: "row",
					fields: [
						{
							name: "provider",
							type: "select",
							options: options(["didit", "smileid"] as const),
							admin: { width: "33%" },
						},
						{
							name: "sessionRef",
							type: "text",
							index: true,
							admin: { width: "33%" },
						},
						{
							name: "status",
							type: "select",
							defaultValue: "not_started",
							options: options(KYC_STATUSES),
							admin: { width: "33%" },
						},
					],
				},
				{
					type: "row",
					fields: [
						{
							name: "attempts",
							type: "number",
							defaultValue: 0,
							admin: { width: "50%" },
						},
						{ name: "decidedAt", type: "date", admin: { width: "50%" } },
					],
				},
				{
					type: "row",
					fields: [
						{
							name: "documentType",
							type: "select",
							options: options([
								"national_id",
								"passport",
								"residence_permit",
							] as const),
							admin: { width: "50%" },
						},
						{
							name: "documentCountry",
							type: "text",
							maxLength: 2,
							admin: { width: "50%" },
						},
					],
				},
				{
					// HMAC-SHA256 of the normalised number under VERIFICATION_HASH_PEPPER.
					// The number itself never reaches the database.
					name: "documentNumberHash",
					type: "text",
					index: true,
					access: { read: reviewerField },
				},
				{
					type: "row",
					fields: [
						{
							name: "documentNumberLast4",
							type: "text",
							maxLength: 4,
							admin: { width: "50%" },
						},
						{
							name: "documentExpiresAt",
							type: "date",
							admin: { width: "50%" },
						},
					],
				},
				{
					type: "row",
					fields: [
						{ name: "givenNames", type: "text", admin: { width: "50%" } },
						{ name: "familyName", type: "text", admin: { width: "50%" } },
					],
				},
				{
					type: "row",
					fields: [
						{
							// Derived from the date of birth, which is never stored.
							name: "adult",
							type: "checkbox",
							defaultValue: false,
							admin: { width: "33%" },
						},
						{
							name: "livenessPassed",
							type: "checkbox",
							defaultValue: false,
							admin: { width: "33%" },
						},
						{
							name: "faceMatchScore",
							type: "number",
							min: 0,
							max: 100,
							access: { read: reviewerField },
							admin: { width: "33%" },
						},
					],
				},
				{
					name: "vendorWarnings",
					type: "json",
					access: { read: reviewerField },
				},
				{
					type: "row",
					fields: [
						{
							name: "vendorReviewUrl",
							type: "text",
							access: { read: reviewerField },
							admin: { width: "50%" },
						},
						{
							name: "vendorDataDeletedAt",
							type: "date",
							admin: { width: "50%" },
						},
					],
				},
			],
		},
		{
			name: "business",
			type: "group",
			admin: { description: "Level 3 only." },
			fields: [
				{
					type: "row",
					fields: [
						{
							name: "businessType",
							type: "select",
							options: options(BUSINESS_TYPES),
							admin: { width: "33%" },
						},
						{
							name: "legalName",
							type: "text",
							maxLength: 120,
							admin: { width: "33%" },
						},
						{
							name: "tradeName",
							type: "text",
							maxLength: 120,
							admin: { width: "33%" },
						},
					],
				},
				{
					type: "row",
					fields: [
						{
							name: "rccmNumber",
							type: "text",
							maxLength: 40,
							index: true,
							admin: { width: "33%" },
						},
						{
							name: "entreprenantDeclarationNumber",
							type: "text",
							maxLength: 40,
							index: true,
							admin: { width: "33%" },
						},
						{
							name: "niu",
							type: "text",
							maxLength: 14,
							index: true,
							admin: { width: "33%" },
						},
					],
				},
				{ name: "registeredAddress", type: "textarea", maxLength: 500 },
				{
					type: "row",
					fields: [
						{
							name: "city",
							type: "text",
							maxLength: 80,
							admin: { width: "33%" },
						},
						{
							name: "legalRepresentativeName",
							type: "text",
							maxLength: 120,
							admin: { width: "33%" },
						},
						{
							name: "legalRepresentativeIsOwner",
							type: "checkbox",
							defaultValue: true,
							admin: { width: "33%" },
						},
					],
				},
			],
		},
		{
			name: "reviewSignals",
			type: "array",
			access: { read: reviewerField },
			fields: [
				{
					type: "row",
					fields: [
						{
							name: "code",
							type: "select",
							required: true,
							options: options(REVIEW_SIGNAL_CODES),
							admin: { width: "33%" },
						},
						{ name: "detail", type: "text", admin: { width: "33%" } },
						{
							name: "relatedRequest",
							type: "relationship",
							relationTo: "verification-requests",
							admin: { width: "33%" },
						},
					],
				},
			],
		},
		{
			type: "row",
			fields: [
				{
					name: "assignee",
					type: "relationship",
					relationTo: "users",
					index: true,
					access: { read: reviewerField },
					admin: { width: "50%" },
				},
				{
					name: "claimedAt",
					type: "date",
					access: { read: reviewerField },
					admin: { width: "50%" },
				},
			],
		},
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
					type: "row",
					fields: [
						{
							name: "requestedBy",
							type: "relationship",
							relationTo: "users",
							access: { read: reviewerField },
							admin: { width: "33%" },
						},
						{
							name: "requestedAt",
							type: "date",
							required: true,
							admin: { width: "33%" },
						},
						{ name: "respondedAt", type: "date", admin: { width: "33%" } },
					],
				},
			],
		},
		{
			name: "decision",
			type: "group",
			fields: [
				{
					type: "row",
					fields: [
						{
							name: "decidedBy",
							type: "relationship",
							relationTo: "users",
							access: { read: reviewerField },
							admin: { width: "33%" },
						},
						{ name: "decidedAt", type: "date", admin: { width: "33%" } },
						{ name: "reasonCode", type: "text", admin: { width: "33%" } },
					],
				},
				{ name: "sellerMessage", type: "textarea" },
				{
					name: "internalNote",
					type: "textarea",
					access: { read: reviewerField },
				},
				{ name: "checklist", type: "json", access: { read: reviewerField } },
			],
		},
		{
			type: "row",
			fields: [
				{
					name: "submittedAt",
					type: "date",
					index: true,
					admin: { width: "25%" },
				},
				{ name: "approvedAt", type: "date", admin: { width: "25%" } },
				{
					name: "expiresAt",
					type: "date",
					index: true,
					admin: { width: "25%" },
				},
				{ name: "revokedAt", type: "date", admin: { width: "25%" } },
			],
		},
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
		{
			name: "documents",
			type: "join",
			collection: "verification-documents",
			on: "request",
		},
	],
	timestamps: true,
};
