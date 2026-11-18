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

/** The signed-in upload route: a shop member's photo for an attempt, a handover or a declaration. */
export const shipmentPhotoPath = (shipmentId: string) =>
	`/api/shipments/${encodeURIComponent(shipmentId)}/photo`;

/** The body `declare-delivered` takes: the photo is mandatory, the rest optional. */
export function declareDeliveredBody(input: {
	photoId: string;
	note?: string;
	gps?: { lat: number; lng: number } | null;
}) {
	const note = input.note?.trim();
	return {
		photoId: input.photoId,
		...(note ? { note } : {}),
		...(input.gps ? { gps: input.gps } : {}),
	};
}
