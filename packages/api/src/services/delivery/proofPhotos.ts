import type { File as PayloadFile, PayloadRequest } from "payload";
import type { DeliveryProof, Shipment } from "../../payload-types";

export const PROOF_PHOTO_KINDS = [
	"attempt",
	"handover",
	"declaration",
] as const;
export type ProofPhotoKind = (typeof PROOF_PHOTO_KINDS)[number];

/**
 * The seller side of the rider route's photo upload: the same collection and
 * limits, `uploadedVia: "seller_app"`. The id of the row it returns is what
 * `declare-delivered`, `handover` and `attempts` take as `photoId`.
 */
export function createSellerProofPhoto(
	req: PayloadRequest,
	shipment: Shipment,
	input: { kind: ProofPhotoKind; file: PayloadFile },
	uploadedBy: string,
): Promise<DeliveryProof> {
	return req.payload.create({
		collection: "delivery-proofs",
		req,
		overrideAccess: true,
		file: input.file,
		data: {
			shipment: String(shipment.id),
			kind: input.kind,
			uploadedBy,
			uploadedVia: "seller_app",
		},
	});
}
