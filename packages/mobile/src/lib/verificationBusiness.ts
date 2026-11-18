import { z } from "zod";
import type { BusinessType } from "../types/api";
import type { BusinessValues } from "./verification";

/**
 * The required-documents table (`REQUIRED_DOCUMENTS`, `requiredKinds`,
 * `missingKinds`, `canSubmit`) already lives in `./verification` — Task 27's
 * mobile mirror of the same table on the API and on web. This module only
 * adds what Task 27 did not: the react-hook-form schema for the business
 * form itself and the pre-upload document checks, then re-exports the
 * document table so a screen has one import for both halves.
 */
export {
	type BusinessValues,
	canSubmit,
	missingKinds,
	REQUIRED_DOCUMENTS,
	requiredKinds,
} from "./verification";

// ─── Business form schema ──────────────────────────────────────────────────────

export const BUSINESS_TYPES = [
	"entreprenant",
	"sole_trader",
	"company",
	"cooperative",
] as const satisfies readonly BusinessType[];

/**
 * Mirrors the server's `businessSchema` in
 * `packages/api/src/app/(frontend)/api/verification-requests/[id]/business/route.ts`
 * (and its web copy in `packages/web/src/lib/verification-business.ts`)
 * field-for-field: same lengths, same character classes, same NIU shape. A
 * controlled RN `TextInput` holds `""` for "nothing typed yet" the same way
 * a web `<input>` does, so an empty registration number is treated as
 * "not provided" here too.
 */
const REGISTRATION_NUMBER_PATTERN = /^[A-Z0-9/.\- ]{8,40}$/i;

/**
 * A NIU of the right shape (14 alphanumeric characters). The stricter
 * `^[A-Z]\d{12}[A-Z]$` check is the server's `niu_format` review signal, not
 * a refusal — a value that fails it still parses here, so the form never
 * blocks a number a tax office actually issued.
 */
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

function normalizeRegistrationNumber(value: string): string {
	return value.trim().replace(/\s+/g, " ").toUpperCase();
}

/**
 * Cleans up what the user typed before it is sent to the server. Only the
 * registration numbers and the NIU get a format opinion here: `legalName`,
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

/** Builds the `BusinessValues` shape `canSubmit`/`missingKinds` (Task 27) want
 * out of the server's nullable `business` field, treating an unset value the
 * same way the form does: not yet provided. */
export function toBusinessValues(business: {
	businessType: BusinessType | null;
	legalName: string | null;
	tradeName: string | null;
	rccmNumber: string | null;
	entreprenantDeclarationNumber: string | null;
	niu: string | null;
	registeredAddress: string | null;
	city: string | null;
	legalRepresentativeName: string | null;
	legalRepresentativeIsOwner: boolean;
}): BusinessValues {
	return {
		businessType: business.businessType ?? "company",
		legalName: business.legalName ?? "",
		tradeName: business.tradeName ?? "",
		rccmNumber: business.rccmNumber ?? "",
		entreprenantDeclarationNumber: business.entreprenantDeclarationNumber ?? "",
		niu: business.niu ?? "",
		registeredAddress: business.registeredAddress ?? "",
		city: business.city ?? "",
		legalRepresentativeName: business.legalRepresentativeName ?? "",
		legalRepresentativeIsOwner: business.legalRepresentativeIsOwner,
	};
}

// ─── Document picking and pre-upload checks ────────────────────────────────────

/**
 * Mirrors `VERIFICATION_MIME_TYPES` and `MAX_VERIFICATION_FILE_SIZE` in
 * `packages/api/src/collections/VerificationDocuments.ts`. The API is the one
 * that actually enforces this (`ApiErrors.upload.invalidType` /
 * `upload.tooLarge`); this copy exists only to refuse before a slow upload
 * runs, using the same two error codes so the message is identical either way.
 */
export const ACCEPTED_DOCUMENT_MIME_TYPES = [
	"image/jpeg",
	"image/png",
	"image/webp",
	"application/pdf",
] as const;

export const MAX_DOCUMENT_FILE_SIZE = 10 * 1024 * 1024;

/** The `documents` endpoint's own per-request cap (`MAX_DOCUMENTS_PER_REQUEST`
 * in `packages/api/src/collections/VerificationDocuments.ts`). Nothing here
 * refuses at this limit client-side — five slots at most are ever offered —
 * it is recorded so the number is not reinvented if a screen ever needs it. */
export const MAX_DOCUMENTS_PER_REQUEST = 10;

/** The picker result a document slot hands to the upload mutation, before
 * any upload has started — the mobile shape of a picked file, whichever of
 * the three sources (camera, library, document) produced it. */
export interface PickedFile {
	uri: string;
	fileName: string | null;
	mimeType: string | null;
	size: number | null;
}

export type DocumentCheckResult =
	| { ok: true }
	| { ok: false; code: "upload.invalidType" | "upload.tooLarge" };

/**
 * Refuses a picked file before any upload starts, using the same two codes
 * the server answers with — never a message invented on the client. A file
 * with no reported size is refused rather than uploaded blind: the API's own
 * size check cannot be second-guessed from an unknown size.
 */
export function isAcceptedDocument(file: {
	mimeType: string | null;
	size: number | null;
}): DocumentCheckResult {
	if (
		!file.mimeType ||
		!(ACCEPTED_DOCUMENT_MIME_TYPES as readonly string[]).includes(file.mimeType)
	) {
		return { ok: false, code: "upload.invalidType" };
	}
	if (file.size == null) return { ok: false, code: "upload.invalidType" };
	if (file.size > MAX_DOCUMENT_FILE_SIZE) {
		return { ok: false, code: "upload.tooLarge" };
	}
	return { ok: true };
}
