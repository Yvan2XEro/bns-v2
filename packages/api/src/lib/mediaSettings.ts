import type { Payload } from "payload";
import { normalizePhotoLimit, PHOTO_LIMIT } from "../contracts/photoLimit";

/** An unreadable settings global answers the default limit rather than blocking every photo. */
export async function getPhotosIncluded(payload: Payload): Promise<number> {
	try {
		const settings = await payload.findGlobal({
			slug: "app-settings",
			depth: 0,
			overrideAccess: true,
		});
		return normalizePhotoLimit(
			(settings as { media?: { photosIncluded?: unknown } | null }).media
				?.photosIncluded,
		);
	} catch {
		return PHOTO_LIMIT.default;
	}
}
