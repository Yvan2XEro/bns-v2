import config from "@payload-config";
import { getPayload } from "payload";
import { z } from "zod";
import { isLaunchCityKey } from "@/lib/launchCities";

const paramsSchema = z.object({ id: z.string().trim().min(1) });

export async function GET(
	_request: Request,
	{ params }: { params: Promise<{ id: string }> },
) {
	const parsed = paramsSchema.safeParse(await params);
	if (!parsed.success)
		return Response.json({ error: "not_found" }, { status: 404 });
	const payload = await getPayload({ config });
	const shop = await payload
		.findByID({
			collection: "shops",
			id: parsed.data.id,
			depth: 0,
			overrideAccess: true,
		})
		.catch(() => null);
	if (!shop || shop.status !== "active")
		return Response.json({ error: "not_found" }, { status: 404 });
	const [zones, locations] = await Promise.all([
		payload.find({
			collection: "delivery-zones",
			where: {
				and: [
					{ shop: { equals: parsed.data.id } },
					{ active: { equals: true } },
				],
			},
			limit: 0,
			pagination: false,
			depth: 0,
			overrideAccess: true,
		}),
		payload.find({
			collection: "shop-locations",
			where: {
				and: [
					{ shop: { equals: parsed.data.id } },
					{ active: { equals: true } },
					{ pickupEnabled: { equals: true } },
				],
			},
			limit: 0,
			pagination: false,
			depth: 0,
			overrideAccess: true,
		}),
	]);
	const cities = new Set<string>();
	for (const doc of [...zones.docs, ...locations.docs]) {
		if (isLaunchCityKey(doc.city)) cities.add(doc.city);
	}
	return Response.json({ deliveryCities: [...cities].sort() });
}
