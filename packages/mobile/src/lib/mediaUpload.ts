import { File } from "expo-file-system";

type UploadableAsset = {
	uri: string;
	fileName?: string | null;
	mimeType?: string | null;
};

function inferExtension(mimeType?: string | null): string {
	switch (mimeType) {
		case "image/png":
			return ".png";
		case "image/webp":
			return ".webp";
		case "image/heic":
			return ".heic";
		case "image/heif":
			return ".heif";
		default:
			return ".jpg";
	}
}

export async function createMediaUploadFormData(
	asset: UploadableAsset,
	options: {
		defaultBaseName: string;
		alt: string;
	},
): Promise<FormData> {
	const sourceFile = new File(asset.uri);
	const fallbackName = `${options.defaultBaseName}${inferExtension(asset.mimeType)}`;
	const fileName = asset.fileName?.trim() || sourceFile.name || fallbackName;

	const formData = new FormData();
	formData.append("file", sourceFile, fileName);
	formData.append("_payload", JSON.stringify({ alt: options.alt }));
	return formData;
}
