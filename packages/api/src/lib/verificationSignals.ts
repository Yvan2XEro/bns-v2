import type { ReviewSignalCode } from "../collections/VerificationRequests";

export interface ReviewSignal {
	code: ReviewSignalCode;
	detail: string | null;
	relatedRequest: string | null;
}

export const NIU_PATTERN = /^[A-Z]\d{12}[A-Z]$/;

/** Lowercase, accents stripped, tokens under 2 characters dropped. */
export function normalizeName(value: string): string[] {
	return value
		.normalize("NFD")
		.replace(/[̀-ͯ]/g, "")
		.toLowerCase()
		.split(/[^a-z0-9]+/)
		.filter((token) => token.length >= 2);
}

/**
 * Any shared token counts. Cameroonian names are routinely recorded in a
 * different order on a document than in an account, with or without a middle
 * name, so requiring a full match would flag almost everyone — and a signal
 * everyone trips is a signal reviewers stop reading.
 */
export function namesOverlap(a: string, b: string): boolean {
	const left = new Set(normalizeName(a));
	return normalizeName(b).some((token) => left.has(token));
}

export function normalizeRegistrationNumber(value: string): string {
	return value.trim().replace(/\s+/g, " ").toUpperCase();
}

export function normalizeNiu(value: string): string {
	return value.replace(/\s+/g, "").toUpperCase();
}

export function isWellFormedNiu(value: string): boolean {
	return NIU_PATTERN.test(normalizeNiu(value));
}

export interface SignalInput {
	ownerId?: string;
	ownerName: string;
	shopId: string;
	kyc: {
		status:
			| "pending"
			| "approved"
			| "declined"
			| "review"
			| "abandoned"
			| "error"
			| "not_started";
		givenNames: string | null;
		familyName: string | null;
		adult: boolean;
		documentNumberHash: string | null;
	} | null;
	business: { rccmNumber: string | null; niu: string | null } | null;
	documentDuplicates: { documentId: string; shopId: string }[];
	otherRequests: {
		id: string;
		shopId: string;
		submittedById: string;
		status: string;
		documentNumberHash: string | null;
		rccmNumber: string | null;
		niu: string | null;
	}[];
}

/**
 * Signals never block on their own: they keep a request out of automatic
 * approval and put a chip in front of a reviewer. A rejection is always a
 * person's decision.
 */
export function computeSignals(input: SignalInput): ReviewSignal[] {
	const signals: ReviewSignal[] = [];
	const live = (status: string) =>
		["draft", "submitted", "in_review", "needs_info", "approved"].includes(
			status,
		);

	if (input.kyc) {
		if (input.kyc.status === "declined")
			signals.push({
				code: "kyc_declined",
				detail: null,
				relatedRequest: null,
			});
		if (input.kyc.status === "review")
			signals.push({ code: "kyc_review", detail: null, relatedRequest: null });
		if (!input.kyc.adult)
			signals.push({ code: "underage", detail: null, relatedRequest: null });

		const documentName = [input.kyc.givenNames, input.kyc.familyName]
			.filter(Boolean)
			.join(" ");
		if (documentName && !namesOverlap(input.ownerName, documentName)) {
			signals.push({
				code: "name_mismatch",
				detail: documentName,
				relatedRequest: null,
			});
		}

		if (input.kyc.documentNumberHash) {
			const reuse = input.otherRequests.find(
				(other) =>
					other.documentNumberHash === input.kyc?.documentNumberHash &&
					other.submittedById !== input.ownerId &&
					live(other.status),
			);
			if (reuse)
				signals.push({
					code: "identity_reused",
					detail: reuse.submittedById,
					relatedRequest: reuse.id,
				});
		}
	}

	const foreignDuplicate = input.documentDuplicates.find(
		(d) => d.shopId !== input.shopId,
	);
	if (foreignDuplicate) {
		signals.push({
			code: "document_reused",
			detail: foreignDuplicate.documentId,
			relatedRequest: null,
		});
	}

	if (input.business) {
		const rccm = input.business.rccmNumber
			? normalizeRegistrationNumber(input.business.rccmNumber)
			: null;
		if (rccm) {
			const reuse = input.otherRequests.find(
				(other) =>
					other.shopId !== input.shopId &&
					live(other.status) &&
					other.rccmNumber &&
					normalizeRegistrationNumber(other.rccmNumber) === rccm,
			);
			if (reuse)
				signals.push({
					code: "rccm_reused",
					detail: rccm,
					relatedRequest: reuse.id,
				});
		}

		const niu = input.business.niu ? normalizeNiu(input.business.niu) : null;
		if (niu) {
			const reuse = input.otherRequests.find(
				(other) =>
					other.shopId !== input.shopId &&
					live(other.status) &&
					other.niu &&
					normalizeNiu(other.niu) === niu,
			);
			if (reuse)
				signals.push({
					code: "niu_reused",
					detail: niu,
					relatedRequest: reuse.id,
				});
			if (!isWellFormedNiu(niu)) {
				signals.push({ code: "niu_format", detail: niu, relatedRequest: null });
			}
		}
	}

	return signals;
}
