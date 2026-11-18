import config from "@payload-config";
import { getPayload } from "payload";
import { handleServiceError } from "@/lib/shopRoute";
import { listPublicVariants } from "@/services/catalogue";

/**
 * Buyer-facing variant list for a listing's detail page. Unlike
 * `GET /api/product-variants`, this never widens for a signed-in shop
 * member: see `listPublicVariants` for why the two must stay separate.
 */
export async function GET(
	_request: Request,
	{ params }: { params: Promise<{ id: string }> },
) {
	const { id } = await params;
	try {
		const payload = await getPayload({ config });
		return Response.json(await listPublicVariants(payload, id));
	} catch (error) {
		return handleServiceError("public-variants", error);
	}
}
