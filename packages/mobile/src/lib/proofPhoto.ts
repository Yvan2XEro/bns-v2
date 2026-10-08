/** The limits `delivery-proofs` enforces: JPEG or PNG, 5 MB (`DeliveryProofs.ts`). */
export const PROOF_MIME_TYPES = ["image/jpeg", "image/png"] as const;
export const PROOF_MAX_BYTES = 5 * 1024 * 1024;
export const PROOF_QUALITY = 0.8;

export type ProofKind = "attempt" | "handover" | "declaration";

export interface ProofAsset {
	uri: string;
	mimeType?: string | null;
	fileSize?: number | null;
}

export type ProofRefusal = "type" | "size";

/** `null` when the photo may be sent; an unknown size is let through, the server answers. */
export function proofPhotoRefusal(asset: ProofAsset): ProofRefusal | null {
	const type = asset.mimeType ?? "image/jpeg";
	if (!(PROOF_MIME_TYPES as readonly string[]).includes(type)) return "type";
	if (asset.fileSize != null && asset.fileSize > PROOF_MAX_BYTES) return "size";
	return null;
}

/** The landed upload route: a rider-link holder's photo, keyed by the link's token. */
export const riderLinkPhotoPath = (token: string) =>
	`/api/public/rider/${encodeURIComponent(token)}/photo`;
