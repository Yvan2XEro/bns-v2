import type { File as PayloadFile, PayloadRequest } from "payload";
import { ERROR_CODES } from "../../lib/errors";
import { relationId } from "../../lib/relationId";
import { ServiceError } from "../../lib/serviceError";
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

/** A photo id is only accepted when the row is this shipment's, of the right kind. */
export async function assertProofPhoto(
	req: PayloadRequest,
	shipment: Shipment,
	photoId: string,
	kind: ProofPhotoKind,
): Promise<void> {
	const photo = await req.payload
		.findByID({
			collection: "delivery-proofs",
			id: photoId,
			depth: 0,
			overrideAccess: true,
			req,
		})
		.catch(() => null);
	if (
		!photo ||
		relationId(photo.shipment) !== String(shipment.id) ||
		photo.kind !== kind
	) {
		throw new ServiceError(ERROR_CODES.shipmentPhotoRequired, 400);
	}
}
