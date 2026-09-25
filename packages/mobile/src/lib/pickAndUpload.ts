import * as ImagePicker from "expo-image-picker";
import { api } from "./api";
import { createMediaUploadFormData } from "./mediaUpload";

/**
 * Library pick + upload to `media`. `null` when the user cancels or denies
 * access. Any server refusal (`upload.tooLarge`, `upload.invalidType`, …)
 * propagates as-is as an `ApiError` — this never swallows it, so the caller
 * can resolve it through `resolveErrorMessage` and show the real reason
 * instead of a generic failure, and never ends up saving a half-uploaded id.
 */
export async function pickAndUploadImage(options: {
	alt: string;
	aspect?: [number, number];
}): Promise<{ id: string; url: string } | null> {
	const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
	if (permission.status !== "granted") return null;

	const result = await ImagePicker.launchImageLibraryAsync({
		mediaTypes: ["images"],
		allowsEditing: true,
		aspect: options.aspect,
		quality: 0.85,
	});
	if (result.canceled || !result.assets?.[0]) return null;

	const asset = result.assets[0];
	const data = await createMediaUploadFormData(asset, {
		defaultBaseName: `shop_${Date.now()}`,
		alt: options.alt,
	});
	const uploaded = await api.upload<{ doc: { id: string; url: string } }>(
		"/api/media",
		data,
	);
	if (!uploaded?.doc?.id) throw new Error("upload_failed");
	return { id: uploaded.doc.id, url: uploaded.doc.url };
}
