import { addDataAndFileToRequest, type Endpoint } from "payload";
import { ERROR_CODES, errorResponse } from "../lib/errors";
import { handleServiceError, toServiceUser } from "../lib/shopRoute";
import { updateProduct } from "../services/products";

/** On the collection so it does not shadow Payload's REST GET /api/products/:id. */
export const updateProductEndpoint: Endpoint = {
	path: "/:id",
	method: "patch",
	handler: async (req) => {
		if (!req.user) return errorResponse(ERROR_CODES.unauthorized, 401);
		const id = String(req.routeParams?.id ?? "");
		await addDataAndFileToRequest(req);
		try {
			return Response.json(
				await updateProduct(
					req.payload,
					toServiceUser(req.user),
					id,
					(req.data ?? {}) as Record<string, unknown>,
				),
			);
		} catch (error) {
			return handleServiceError("product:update", error);
		}
	},
};
