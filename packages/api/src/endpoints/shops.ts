import { addDataAndFileToRequest, type Endpoint } from "payload";
import { ERROR_CODES, errorResponse } from "../lib/errors";
import { handleServiceError, toServiceUser } from "../lib/shopRoute";
import { createShop } from "../services/shops";

/**
 * Registered on the collection rather than as a Next route: a
 * `app/(frontend)/api/shops/route.ts` would shadow Payload's REST
 * `GET /api/shops`, which the admin relationship pickers use.
 */
export const createShopEndpoint: Endpoint = {
	path: "/",
	method: "post",
	handler: async (req) => {
		if (!req.user) return errorResponse(ERROR_CODES.unauthorized, 401);
		await addDataAndFileToRequest(req);
		const body = (req.data ?? {}) as Record<string, unknown>;

		try {
			const shop = await createShop(req.payload, toServiceUser(req.user), {
				handle: body.handle,
				name: body.name,
				description: body.description,
				city: body.city,
				categories: body.categories,
			});
			return Response.json({ shop }, { status: 201 });
		} catch (error) {
			return handleServiceError("create", error);
		}
	},
};
