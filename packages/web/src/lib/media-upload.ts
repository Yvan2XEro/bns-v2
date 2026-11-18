import {
	fitWithin,
	MEDIA_ORIGINAL_MAX_SIDE,
} from "../../../api/src/contracts/media";

/** Below this, a JPEG/WebP within the size cap is sent untouched. */
const LIGHT_ENOUGH_BYTES = 1.5 * 1024 * 1024;
const JPEG_QUALITY = 0.85;

/**
 * Whether re-encoding is worth it. PNGs are left alone (a logo's transparency
 * would not survive a JPEG); the API caps their size anyway.
 */
export function shouldShrink(
	file: { type: string; size: number },
	width: number,
	height: number,
): boolean {
	if (file.type !== "image/jpeg" && file.type !== "image/webp") return false;
	return (
		Math.max(width, height) > MEDIA_ORIGINAL_MAX_SIDE ||
		file.size > LIGHT_ENOUGH_BYTES
	);
}

/**
 * A phone photo scaled down in the browser before it leaves: a 12 MP, 4 MB
 * picture uploads as a few hundred KB over a mobile connection, and the
 * re-encode drops its EXIF (GPS position included). Falls back to the
 * original file whenever the browser cannot decode it or the result is not
 * smaller.
 */
export async function shrinkImage(file: File): Promise<File> {
	if (typeof createImageBitmap !== "function") return file;
	let bitmap: ImageBitmap;
	try {
		bitmap = await createImageBitmap(file);
	} catch {
		return file;
	}
	try {
		if (!shouldShrink(file, bitmap.width, bitmap.height)) return file;
		const { width, height } = fitWithin(bitmap.width, bitmap.height);
		const canvas = document.createElement("canvas");
		canvas.width = width;
		canvas.height = height;
		const context = canvas.getContext("2d");
		if (!context) return file;
		context.drawImage(bitmap, 0, 0, width, height);
		const blob = await new Promise<Blob | null>((resolve) =>
			canvas.toBlob(resolve, "image/jpeg", JPEG_QUALITY),
		);
		if (!blob || blob.size >= file.size) return file;
		const name = file.name.replace(/\.[^.]+$/, "") || "photo";
		return new File([blob], `${name}.jpg`, { type: "image/jpeg" });
	} finally {
		bitmap.close();
	}
}

/** The multipart body `POST /api/media` expects, photo already shrunk. */
export async function mediaUploadForm(
	file: File,
	alt: string,
): Promise<FormData> {
	const form = new FormData();
	form.append("file", await shrinkImage(file));
	form.append("_payload", JSON.stringify({ alt: alt || "image" }));
	return form;
}
