import { handleServiceError, requireUser } from "@/lib/shopRoute";
import { listMyShops } from "@/services/shopMembers";

/**
 * Drives the shop switcher. `GET /api/shops/mine` stays as it is: it answers
 * with the single owned shop a released client expects, and changing its shape
 * would break every shipped build.
 */
export async function GET(request: Request) {
	const ctx = await requireUser(request);
	if (ctx instanceof Response) return ctx;
	try {
		return Response.json(await listMyShops(ctx.payload, ctx.user));
	} catch (error) {
		return handleServiceError("me:shops", error);
	}
}
