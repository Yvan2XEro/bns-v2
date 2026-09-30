import { z } from "zod";
import type { BusinessType, DocumentKind } from "./verification";

/**
 * Mirrors the server's `businessSchema` in
 * `packages/api/src/app/(frontend)/api/verification-requests/[id]/business/route.ts`
 * field-for-field: same lengths, same character classes, same NIU shape. The
 * one deliberate difference is structural, not a looser rule: a controlled
 * text input holds `""` for "nothing typed yet" (react-hook-form has no clean
 * `null` story for text fields), where the server's own zod schema treats an
 * absent registration number as `null`/`undefined`. `businessSchema` below
 * treats an empty string the same way the server treats a missing value —
 * "not provided" — everywhere else the two accept and refuse the exact same
 * strings.
 */
export const BUSINESS_TYPES = [
	"entreprenant",
	"sole_trader",
	"company",
	"cooperative",
] as const satisfies readonly BusinessType[];

const REGISTRATION_NUMBER_PATTERN = /^[A-Z0-9/.\- ]{8,40}$/i;

/** A NIU of the right shape (14 alphanumeric characters). The stricter
 * `^[A-Z]\d{12}[A-Z]$` check is the server's `niu_format` review signal, not
 * a refusal — a value that fails it still parses here. */
const NIU_PATTERN = /^[A-Za-z0-9]{14}$/;

export const businessSchema = z
	.object({
		businessType: z.enum(BUSINESS_TYPES),
		legalName: z.string().trim().min(2).max(120),
		tradeName: z.string().trim().max(120),
		rccmNumber: z.string().trim(),
		entreprenantDeclarationNumber: z.string().trim(),
		niu: z.string().trim().regex(NIU_PATTERN),
		registeredAddress: z.string().trim().min(1).max(500),
		city: z.string().trim().min(1).max(80),
		legalRepresentativeName: z.string().trim().min(2).max(120),
		legalRepresentativeIsOwner: z.boolean(),
	})
	.superRefine((values, ctx) => {
		for (const field of [
			"rccmNumber",
			"entreprenantDeclarationNumber",
		] as const) {
			const value = values[field];
			if (value && !REGISTRATION_NUMBER_PATTERN.test(value)) {
				ctx.addIssue({
					code: z.ZodIssueCode.custom,
					path: [field],
					message: "invalid registration number",
				});
			}
		}
		const requiredField =
			values.businessType === "entreprenant"
				? "entreprenantDeclarationNumber"
				: "rccmNumber";
		if (!values[requiredField]) {
			ctx.addIssue({
				code: z.ZodIssueCode.custom,
				path: [requiredField],
				message: "registration number required",
			});
		}
	});

export type BusinessFormValues = z.infer<typeof businessSchema>;

/** Mirrors the server's `REQUIRED_DOCUMENTS` in `verificationDocuments.ts`. */
const REQUIRED_DOCUMENTS: Record<BusinessType, readonly DocumentKind[]> = {
	entreprenant: ["entreprenant_declaration", "niu_certificate"],
	sole_trader: ["rccm_extract", "niu_certificate"],
	company: ["rccm_extract", "niu_certificate"],
	cooperative: ["rccm_extract", "niu_certificate"],
};

export function requiredKinds(
	businessType: BusinessType,
	legalRepresentativeIsOwner: boolean,
): DocumentKind[] {
	const kinds: DocumentKind[] = [...REQUIRED_DOCUMENTS[businessType]];
	if (!legalRepresentativeIsOwner) {
		kinds.push("legal_representative_id", "mandate");
	}
	return kinds;
}

export function missingKinds(
	values: Pick<
		BusinessFormValues,
		"businessType" | "legalRepresentativeIsOwner"
	>,
	documents: { kind: DocumentKind | string }[],
): DocumentKind[] {
	const present = new Set(documents.map((document) => document.kind));
	return requiredKinds(
		values.businessType,
		values.legalRepresentativeIsOwner,
	).filter((kind) => !present.has(kind));
}

/**
 * Gates the Submit button: the form must parse, and every required document
 * for the chosen business type must be present. `values` is `unknown`
 * because a caller may hand this the server's `business` field, which is
 * `null` (or has null members) before anything has ever been saved.
 */
export function canSubmit(
	values: unknown,
	documents: { kind: DocumentKind | string }[],
): boolean {
	const parsed = businessSchema.safeParse(values);
	if (!parsed.success) return false;
	return missingKinds(parsed.data, documents).length === 0;
}

/** Collapses runs of whitespace to a single space and uppercases — the same
 * shape the server stores, minus the server's final "strip every space". */
function normalizeRegistrationNumber(value: string): string {
	return value.trim().replace(/\s+/g, " ").toUpperCase();
}

/**
 * Mirrors `VERIFICATION_MIME_TYPES` and `MAX_VERIFICATION_FILE_SIZE` in
 * `packages/api/src/collections/VerificationDocuments.ts`. The API is the
 * one that actually enforces this (`ApiErrors.upload.invalidType` /
 * `upload.tooLarge`); this copy exists only to refuse before a slow upload
 * runs, using the same two error codes so the message is identical either
 * way.
 */
export const ACCEPTED_DOCUMENT_MIME_TYPES = [
	"image/jpeg",
	"image/png",
	"image/webp",
	"application/pdf",
] as const;

export const MAX_DOCUMENT_FILE_SIZE = 10 * 1024 * 1024;

export function validateDocumentFile(
	file: File,
): "uploadInvalidType" | "uploadTooLarge" | null {
	if (
		!(ACCEPTED_DOCUMENT_MIME_TYPES as readonly string[]).includes(file.type)
	) {
		return "uploadInvalidType";
	}
	if (file.size > MAX_DOCUMENT_FILE_SIZE) return "uploadTooLarge";
	return null;
}

/**
 * Cleans up what the user typed before it is sent to the server. Only the
 * registration numbers get a format opinion here: `legalName`,
 * `registeredAddress`, `city` and `legalRepresentativeName` are trimmed and
 * left otherwise untouched — a legal name is not ours to re-case.
 */
export function normalizeBusinessValues(
	values: BusinessFormValues,
): BusinessFormValues {
	return {
		...values,
		legalName: values.legalName.trim(),
		tradeName: values.tradeName.trim(),
		rccmNumber: normalizeRegistrationNumber(values.rccmNumber),
		entreprenantDeclarationNumber: normalizeRegistrationNumber(
			values.entreprenantDeclarationNumber,
		),
		niu: values.niu.replace(/\s+/g, "").trim().toUpperCase(),
		registeredAddress: values.registeredAddress.trim(),
		city: values.city.trim(),
		legalRepresentativeName: values.legalRepresentativeName.trim(),
	};
}
