import type { PayloadRequest } from "payload";
import { SHOP_SERVICE_CONTEXT } from "../collections/Shops";

/** Recount rather than increment: idempotent, and self-healing after any missed event. */
export async function refreshShopListingCount(
	req: PayloadRequest,
	shopId: string,
): Promise<void> {
	try {
		const { totalDocs } = await req.payload.count({
			collection: "listings",
			req,
			overrideAccess: true,
			where: {
				and: [
					{ shop: { equals: shopId } },
					{ status: { equals: "published" } },
				],
			},
		});
		await req.payload.update({
			collection: "shops",
			id: shopId,
			req,
			overrideAccess: true,
			context: SHOP_SERVICE_CONTEXT,
			data: { publishedListingCount: totalDocs },
		});
	} catch (error) {
		console.error(
			`[shops] failed to recount listings of shop ${shopId}:`,
			error,
		);
	}
}
