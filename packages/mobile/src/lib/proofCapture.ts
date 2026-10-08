import { File } from "expo-file-system";
import * as ImagePicker from "expo-image-picker";
import { api } from "./api";
import {
	PROOF_QUALITY,
	type ProofAsset,
	type ProofKind,
	proofPhotoRefusal,
	riderLinkPhotoPath,
	shipmentPhotoPath,
} from "./proofPhoto";

/** Camera capture at the house quality; `null` when permission is refused or the user cancels. */
export async function captureProofPhoto(): Promise<
	(ProofAsset & { fileName?: string | null }) | null
> {
	const permission = await ImagePicker.requestCameraPermissionsAsync();
	if (permission.status !== "granted") return null;
	const result = await ImagePicker.launchCameraAsync({
		quality: PROOF_QUALITY,
		exif: false,
	});
	const asset = result.canceled ? undefined : result.assets?.[0];
	return asset
		? {
				uri: asset.uri,
				fileName: asset.fileName ?? null,
				mimeType: asset.mimeType ?? "image/jpeg",
				fileSize: asset.fileSize ?? null,
			}
		: null;
}

async function uploadProof(
	path: string,
	kind: ProofKind,
	photo: ProofAsset & { fileName?: string | null },
): Promise<string> {
	const refusal = proofPhotoRefusal(photo);
	if (refusal) throw new Error(`proof_photo_${refusal}`);
	const file = new File(photo.uri);
	const form = new FormData();
	form.append("file", file, photo.fileName?.trim() || file.name || "proof.jpg");
	form.append("kind", kind);
	const created = await api.upload<{ id: string }>(path, form);
	return created.id;
}

/**
 * Uploads through the rider-link photo route and returns the proof id the
 * attempt / handover body then carries as `photoId`. A refused photo throws
 * before any request goes out.
 */
export function uploadRiderLinkPhoto(
	token: string,
	kind: Exclude<ProofKind, "declaration">,
	photo: ProofAsset & { fileName?: string | null },
): Promise<string> {
	return uploadProof(riderLinkPhotoPath(token), kind, photo);
}

/** The same upload for a signed-in shop member (`POST /api/shipments/{id}/photo`). */
export function uploadShipmentPhoto(
	shipmentId: string,
	kind: ProofKind,
	photo: ProofAsset & { fileName?: string | null },
): Promise<string> {
	return uploadProof(shipmentPhotoPath(shipmentId), kind, photo);
}
