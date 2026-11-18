/**
 * What each verification level asks of a seller, and how far the request on
 * file has got with each item. The submit route and the business-details gate
 * read the same rules (`services/verificationDocuments.ts`,
 * `services/verification.ts`), so the list a seller is shown is the list the
 * server will hold them to.
 */

export type RequirementBusinessType =
	| "entreprenant"
	| "sole_trader"
	| "company"
	| "cooperative";

export type RequirementDocumentKind =
	| "rccm_extract"
	| "entreprenant_declaration"
	| "niu_certificate"
	| "legal_representative_id"
	| "mandate";

export const REQUIRED_DOCUMENTS = {
	entreprenant: ["entreprenant_declaration", "niu_certificate"],
	sole_trader: ["rccm_extract", "niu_certificate"],
	company: ["rccm_extract", "niu_certificate"],
	cooperative: ["rccm_extract", "niu_certificate"],
} as const satisfies Record<
	RequirementBusinessType,
	readonly RequirementDocumentKind[]
>;

/**
 * Level 2 checked by hand: both sides of the identity document and a photo
 * of the seller holding it. A passport's "back" is the page with the
 * signature.
 */
export const IDENTITY_DOCUMENT_KINDS = [
	"identity_front",
	"identity_back",
	"identity_selfie",
] as const;
export type IdentityDocumentKind = (typeof IDENTITY_DOCUMENT_KINDS)[number];

export function missingIdentityDocumentKinds(
	documents: { kind: string }[],
): IdentityDocumentKind[] {
	const present = new Set(documents.map((d) => d.kind));
	return IDENTITY_DOCUMENT_KINDS.filter((kind) => !present.has(kind));
}

export function requiredDocumentKinds(business: {
	businessType?: RequirementBusinessType | null;
	legalRepresentativeIsOwner?: boolean | null;
}): RequirementDocumentKind[] {
	if (!business.businessType) return [];
	const base: RequirementDocumentKind[] = [
		...REQUIRED_DOCUMENTS[business.businessType],
	];
	if (business.legalRepresentativeIsOwner === false) {
		base.push("legal_representative_id", "mandate");
	}
	return base;
}

export interface RequirementBusinessDetails {
	businessType?: RequirementBusinessType | null;
	legalName?: string | null;
	rccmNumber?: string | null;
	entreprenantDeclarationNumber?: string | null;
	niu?: string | null;
	registeredAddress?: string | null;
	city?: string | null;
	legalRepresentativeName?: string | null;
	legalRepresentativeIsOwner?: boolean | null;
}

function filled(value: string | null | undefined): boolean {
	return typeof value === "string" && value.trim().length > 0;
}

/** The rule `assertBusinessValid` applies before a level-3 request may be submitted. */
export function businessDetailsComplete(
	business: RequirementBusinessDetails | null | undefined,
): boolean {
	if (!business?.businessType) return false;
	const registrationNumber =
		business.businessType === "entreprenant"
			? business.entreprenantDeclarationNumber
			: business.rccmNumber;
	return [
		business.legalName,
		business.registeredAddress,
		business.city,
		business.legalRepresentativeName,
		business.niu,
		registrationNumber,
	].every(filled);
}

/**
 * `registration_document` stands for "RCCM extract or entrepreneur's
 * declaration" while the business type that picks one is not chosen yet.
 */
export type VerificationRequirementKey =
	| "identity_document"
	| "selfie"
	| "business_details"
	| "registration_document"
	| RequirementDocumentKind;

export type VerificationRequirementStatus =
	| "missing"
	| "provided"
	| "in_review"
	| "approved"
	| "rejected";

export interface VerificationRequirement {
	key: VerificationRequirementKey;
	status: VerificationRequirementStatus;
}

export interface RequirementRequestInput {
	status: string;
	kyc: { status: string; livenessPassed: boolean } | null;
	business: RequirementBusinessDetails | null;
	documents: { kind: string }[];
}

/** A request in one of these is closed: the next attempt starts from nothing. */
const CLOSED_STATUSES = ["rejected", "revoked", "expired"];
const UNDER_REVIEW_STATUSES = ["submitted", "in_review"];
const KYC_PROVIDED = ["pending", "review", "approved"];

/**
 * `request` is the one on file for `level` (null when none). Each item says
 * whether it is still missing, provided on a draft, being reviewed, accepted
 * with the request, or turned down by the identity vendor.
 *
 * `identityMethod` is how level 2 is checked: by the vendor's session, or by
 * a moderator looking at the documents the seller uploaded.
 */
export function verificationRequirements(
	level: 2 | 3,
	request: RequirementRequestInput | null,
	identityMethod: "manual" | "vendor" = "vendor",
): VerificationRequirement[] {
	const live =
		request && !CLOSED_STATUSES.includes(request.status) ? request : null;

	const statusOf = (provided: boolean): VerificationRequirementStatus => {
		if (!live || !provided) return "missing";
		if (live.status === "approved") return "approved";
		if (UNDER_REVIEW_STATUSES.includes(live.status)) return "in_review";
		return "provided";
	};

	if (level === 2 && identityMethod === "manual") {
		const present = new Set((live?.documents ?? []).map((d) => d.kind));
		return [
			{
				key: "identity_document",
				status: statusOf(
					present.has("identity_front") && present.has("identity_back"),
				),
			},
			{ key: "selfie", status: statusOf(present.has("identity_selfie")) },
		];
	}

	if (level === 2) {
		const kyc = live?.kyc ?? null;
		const declined = kyc?.status === "declined";
		return [
			{
				key: "identity_document",
				status: declined
					? "rejected"
					: statusOf(Boolean(kyc && KYC_PROVIDED.includes(kyc.status))),
			},
			{
				key: "selfie",
				status: declined ? "rejected" : statusOf(Boolean(kyc?.livenessPassed)),
			},
		];
	}

	const business = live?.business ?? null;
	const present = new Set((live?.documents ?? []).map((d) => d.kind));
	const documentItems: VerificationRequirement[] = business?.businessType
		? requiredDocumentKinds(business).map((kind) => ({
				key: kind,
				status: statusOf(present.has(kind)),
			}))
		: [
				{ key: "registration_document", status: "missing" },
				{
					key: "niu_certificate",
					status: statusOf(present.has("niu_certificate")),
				},
			];

	return [
		{
			key: "business_details",
			status: statusOf(businessDetailsComplete(business)),
		},
		...documentItems,
	];
}
