import config from "@payload-config";
import { getPayload } from "payload";
import { z } from "zod";
import { handleServiceError } from "@/lib/shopRoute";
import { publicShopReviews } from "@/services/shopReviews";

// Addressed by shop id, like delivery-cities: the shop page holds the id.
const paramsSchema = z.object({ handle: z.string().trim().min(1) });
const pageSchema = z.coerce.number().int().min(1).max(1000).catch(1);

export async function GET(
	request: Request,
	{ params }: { params: Promise<{ handle: string }> },
) {
	const parsed = paramsSchema.safeParse(await params);
	if (!parsed.success)
		return Response.json({ error: "not_found" }, { status: 404 });
	const page = pageSchema.parse(
		new URL(request.url).searchParams.get("page") ?? 1,
	);
	try {
		const payload = await getPayload({ config });
		return Response.json(
			await publicShopReviews(payload, parsed.data.handle, page),
		);
	} catch (error) {
		return handleServiceError("publicShopReviews", error);
	}
}
