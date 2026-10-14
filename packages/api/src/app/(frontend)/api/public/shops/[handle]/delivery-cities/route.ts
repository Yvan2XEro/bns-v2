import config from "@payload-config";
import { getPayload } from "payload";
import { z } from "zod";
import { handleServiceError } from "@/lib/shopRoute";
import { publicDeliveryCities } from "@/services/delivery/zones";

// Shares the `[handle]` segment with the other public shop routes, but this
// one is addressed by shop id: the search indexer and the shop pages both
// hold the id, not the handle (`contracts/publicPickupPoint.ts`).
const paramsSchema = z.object({ handle: z.string().trim().min(1) });

export async function GET(
	_request: Request,
	{ params }: { params: Promise<{ handle: string }> },
) {
	const parsed = paramsSchema.safeParse(await params);
	if (!parsed.success)
		return Response.json({ error: "not_found" }, { status: 404 });
	try {
		const payload = await getPayload({ config });
		return Response.json(
			await publicDeliveryCities(payload, parsed.data.handle),
		);
	} catch (error) {
		return handleServiceError("publicDeliveryCities", error);
	}
}
