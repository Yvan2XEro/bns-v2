import {
	DISPUTE_EVIDENCE_REQUIREMENTS,
	type DisputeReason,
} from "../../../api/src/contracts/disputes";

export function disputeEvidenceStatus(reason: DisputeReason, count: number) {
	const required = DISPUTE_EVIDENCE_REQUIREMENTS[reason];
	const remaining = Math.max(0, required - count);
	return { required, remaining, canSubmit: remaining === 0 };
}

export type EvidenceKind = "image" | "video" | "file";

export interface EvidenceAttachment {
	id: string;
	kind: EvidenceKind;
	mimeType: string;
}

export function evidenceKind(
	mimeType: string | null | undefined,
): EvidenceKind {
	const type = (mimeType ?? "").toLowerCase();
	if (type.startsWith("image/")) return "image";
	if (type.startsWith("video/")) return "video";
	return "file";
}

/**
 * The evidence a message points at, in the message's order. An id the viewer
 * was not served (staff-only evidence, for a party) is simply not shown.
 */
export function messageAttachments(
	evidenceIds: readonly string[],
	evidence: ReadonlyArray<{ id: string; mimeType: string }>,
): EvidenceAttachment[] {
	const byId = new Map(evidence.map((item) => [item.id, item]));
	return evidenceIds.flatMap((id) => {
		const item = byId.get(id);
		return item
			? [{ id, kind: evidenceKind(item.mimeType), mimeType: item.mimeType }]
			: [];
	});
}

/** Evidence no message carries, so it still has a place in the thread. */
export function looseEvidence<T extends { id: string }>(
	evidence: readonly T[],
	messages: ReadonlyArray<{ evidenceIds: readonly string[] }>,
): T[] {
	const attached = new Set(messages.flatMap((message) => message.evidenceIds));
	return evidence.filter((item) => !attached.has(item.id));
}

/** `POST /api/disputes/{id}/messages` takes at most five evidence ids. */
export const MESSAGE_EVIDENCE_MAX = 5;

export function stageEvidence(staged: readonly string[], id: string): string[] {
	if (staged.includes(id) || staged.length >= MESSAGE_EVIDENCE_MAX) {
		return [...staged];
	}
	return [...staged, id];
}

/**
 * The local storage provider signs a path on the API; S3 and Azure sign an
 * absolute URL on their own host, which must be left exactly as signed.
 */
export function signedEvidenceUrl(url: string, apiOrigin: string): string {
	if (/^https?:\/\//i.test(url)) return url;
	return `${apiOrigin.replace(/\/$/, "")}/${url.replace(/^\//, "")}`;
}
