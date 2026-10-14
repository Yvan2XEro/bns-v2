import config from "@payload-config";
import { getPayload } from "payload";
import type { PopularPlacesResponse } from "@/contracts/places";
import { findPopularPlaces } from "@/services/popularPlaces";

/**
 * GET /api/public/places/popular — the cities published listings concentrate
 * in. A failure answers an empty list: the picker still has search, "near me"
 * and the user's recent places, so it must never break on this.
 */
export async function GET() {
	let body: PopularPlacesResponse = { places: [] };
	try {
		const payload = await getPayload({ config });
		body = { places: await findPopularPlaces(payload) };
	} catch {
		body = { places: [] };
	}
	return Response.json(body, {
		headers: { "Cache-Control": "public, max-age=300, s-maxage=600" },
	});
}
