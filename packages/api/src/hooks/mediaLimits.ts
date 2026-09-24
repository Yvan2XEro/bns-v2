import type { CollectionBeforeOperationHook } from "payload";
import { ERROR_CODES } from "../lib/errors";
import { CodedAPIError } from "../lib/serviceError";

/**
 * Every current upload path (shop logo/banner, avatar, listing and product
 * photos, category seed images) ends up as a raster photo — the web cropper
 * re-encodes to JPEG, mobile pickers report jpeg/png/webp. SVG is excluded on
 * purpose: served back from the app's own origin, an SVG can carry a
 * <script>, and nothing in the product needs vector uploads.
 */
export const ALLOWED_MEDIA_MIME_TYPES = [
	"image/jpeg",
	"image/png",
	"image/webp",
] as const;

/**
 * 10MB comfortably covers an uncompressed shop logo/banner (the one upload
 * path with no client-side resize) while still refusing the multi-gigabyte
 * case this check exists for.
 */
export const MAX_MEDIA_FILE_SIZE = 10 * 1024 * 1024;

/**
 * Runs before Payload's own field validation, for both the REST upload path
 * and the local API (`payload.create({ collection: "media", file })`, used
 * by the category seed script), so a disallowed type or an oversized file
 * never reaches the database either way. `req.file` is absent on an update
 * that does not replace the file, which is not this hook's concern.
 */
export const enforceMediaFileLimits: CollectionBeforeOperationHook<"media"> = ({
	operation,
	req,
}) => {
	if (operation !== "create" && operation !== "update") return;
	const file = req.file;
	if (!file) return;

	if (
		!(ALLOWED_MEDIA_MIME_TYPES as readonly string[]).includes(file.mimetype)
	) {
		throw new CodedAPIError(ERROR_CODES.uploadInvalidType, 400);
	}
	if (file.size > MAX_MEDIA_FILE_SIZE) {
		throw new CodedAPIError(ERROR_CODES.uploadTooLarge, 413);
	}
};
