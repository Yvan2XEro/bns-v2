import { requireOptionalNativeModule } from "expo";
import { File } from "expo-file-system";
import {
	fitWithin,
	MEDIA_ORIGINAL_MAX_SIDE,
} from "../../../api/src/contracts/media";

type UploadableAsset = {
	uri: string;
	fileName?: string | null;
	mimeType?: string | null;
	width?: number;
	height?: number;
};

const JPEG_QUALITY = 0.85;

/**
 * Whether a picked photo is re-encoded before upload: anything but a PNG
 * (a logo's transparency would not survive a JPEG) once its longest side is
 * over the cap, and a HEIC whatever its size, since the API only accepts
 * JPEG, PNG and WebP.
 */
export function shouldShrinkAsset(asset: UploadableAsset): boolean {
	if (asset.mimeType === "image/png") return false;
	if (asset.mimeType === "image/heic" || asset.mimeType === "image/heif") {
		return true;
	}
	const { width, height } = asset;
	if (!width || !height) return false;
	return Math.max(width, height) > MEDIA_ORIGINAL_MAX_SIDE;
}

/**
 * A 12 MP phone photo scaled down on the device before it leaves, so it
 * uploads as a few hundred KB over mobile data. The manipulator is a native
 * module that only builds from this version on carry: an older binary has
 * none, and `expo-image-manipulator` throws at import without it, so it is
 * only imported once the module is known to be there. Any failure sends the
 * original — the API still caps it.
 */
async function shrinkAsset(asset: UploadableAsset): Promise<UploadableAsset> {
	if (!shouldShrinkAsset(asset)) return asset;
	if (!requireOptionalNativeModule("ExpoImageManipulator")) return asset;
	try {
		const { ImageManipulator, SaveFormat } = await import(
			"expo-image-manipulator"
		);
		const context = ImageManipulator.manipulate(asset.uri);
		if (asset.width && asset.height) {
			context.resize(fitWithin(asset.width, asset.height));
		}
		const image = await context.renderAsync();
		const saved = await image.saveAsync({
			compress: JPEG_QUALITY,
			format: SaveFormat.JPEG,
		});
		const baseName = asset.fileName?.replace(/\.[^.]+$/, "");
		return {
			uri: saved.uri,
			fileName: baseName ? `${baseName}.jpg` : null,
			mimeType: "image/jpeg",
			width: saved.width,
			height: saved.height,
		};
	} catch {
		return asset;
	}
}

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
	picked: UploadableAsset,
	options: {
		defaultBaseName: string;
		alt: string;
	},
): Promise<FormData> {
	const asset = await shrinkAsset(picked);
	const sourceFile = new File(asset.uri);
	const fallbackName = `${options.defaultBaseName}${inferExtension(asset.mimeType)}`;
	const fileName = asset.fileName?.trim() || sourceFile.name || fallbackName;

	const formData = new FormData();
	formData.append("file", sourceFile, fileName);
	formData.append("_payload", JSON.stringify({ alt: options.alt }));
	return formData;
}
