import { addDataAndFileToRequest, type Endpoint } from "payload";
import { z } from "zod";
import { ERROR_CODES, errorResponse } from "../lib/errors";
import { handleServiceError, toServiceUser } from "../lib/shopRoute";
import { updateProduct } from "../services/products";

const paramsSchema = z.object({ id: z.string().trim().min(1) });

/**
 * On the collection so it does not shadow Payload's REST GET /api/products/:id.
 * `PATCH /api/products/:id` also takes over Payload's own built-in
 * update-by-id for this collection — harmless today only because
 * `Products.access.update` is closed (`() => false`), so the REST route it
 * would otherwise serve can never write anyway.
 */
export const updateProductEndpoint: Endpoint = {
	path: "/:id",
	method: "patch",
	handler: async (req) => {
		if (!req.user) return errorResponse(ERROR_CODES.unauthorized, 401);
		const parsedParams = paramsSchema.safeParse({ id: req.routeParams?.id });
		if (!parsedParams.success)
			return errorResponse(ERROR_CODES.badRequest, 400);
		await addDataAndFileToRequest(req);
		try {
			return Response.json(
				await updateProduct(
					req.payload,
					toServiceUser(req.user),
					parsedParams.data.id,
					(req.data ?? {}) as Record<string, unknown>,
				),
			);
		} catch (error) {
			return handleServiceError("product:update", error);
		}
	},
};
