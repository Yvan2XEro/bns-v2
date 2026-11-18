import type { Payload } from "payload";
import { relationId } from "./relationId";

interface WithImages {
	id: string | number;
	images?: Array<{ image?: unknown } | null> | null;
}

/**
 * The first image of each product, read in one media query instead of
 * populating every image at depth 1. Keyed by product id; a product with no
 * image, or whose media is gone, is absent.
 */
export async function firstImageUrls(
	payload: Payload,
	products: readonly WithImages[],
): Promise<Map<string, string>> {
	const firstByProduct = new Map<string, string>();
	for (const product of products) {
		const mediaId = relationId(product.images?.[0]?.image);
		if (mediaId) firstByProduct.set(String(product.id), mediaId);
	}
	const urls = new Map<string, string>();
	const mediaIds = [...new Set(firstByProduct.values())];
	if (mediaIds.length === 0) return urls;
	const media = await payload
		.find({
			collection: "media",
			where: { id: { in: mediaIds } },
			limit: 0,
			pagination: false,
			depth: 0,
			overrideAccess: true,
		})
		.catch(() => ({ docs: [] as Array<Record<string, unknown>> }));
	const urlByMedia = new Map<string, string>();
	for (const doc of media.docs as Array<Record<string, unknown>>) {
		const url =
			(typeof doc.thumbnailURL === "string" && doc.thumbnailURL) ||
			(typeof doc.url === "string" && doc.url) ||
			null;
		if (url) urlByMedia.set(String(doc.id), url);
	}
	for (const [productId, mediaId] of firstByProduct) {
		const url = urlByMedia.get(mediaId);
		if (url) urls.set(productId, url);
	}
	return urls;
}
