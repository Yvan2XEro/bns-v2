import type { Payload } from "payload";
import { can } from "../access/shopRoles";
import { PRODUCT_SERVICE_CONTEXT } from "../collections/Products";
import { ERROR_CODES } from "../lib/errors";
import { relationId } from "../lib/relationId";
import { ServiceError } from "../lib/serviceError";
import { withTransaction } from "../lib/transactions";
import { type ProductStatus, syncProductListing } from "./products";
import { requireShopMember } from "./shopGuards";
import type { ServiceUser } from "./shops";

export const BULK_PRODUCT_LIMIT = 100;

/**
 * The catalogue's bulk action: the same status change the editor saves, for
 * several products at once. All of them move or none do, and archiving keeps
 * the editor's own `catalogue.archive` rule.
 */
export async function setProductsStatus(
	payload: Payload,
	user: ServiceUser,
	shopId: string,
	input: { productIds: string[]; status: ProductStatus },
): Promise<{ updated: string[] }> {
	const ids = [...new Set(input.productIds)];
	if (ids.length === 0 || ids.length > BULK_PRODUCT_LIMIT) {
		throw new ServiceError(ERROR_CODES.validation, 400);
	}

	return withTransaction(
		payload,
		async (req) => {
			const { role } = await requireShopMember(payload, user, shopId, {
				writable: true,
				req,
			});
			const products = (
				await req.payload.find({
					collection: "products",
					where: { id: { in: ids } },
					depth: 0,
					limit: 0,
					pagination: false,
					overrideAccess: true,
					req,
				})
			).docs;
			if (
				products.length !== ids.length ||
				products.some((product) => relationId(product.shop) !== shopId)
			) {
				throw new ServiceError(ERROR_CODES.notFound, 404);
			}
			const archiving = products.some(
				(product) =>
					input.status === "archived" && product.status !== "archived",
			);
			if (archiving && !can(role, "catalogue.archive")) {
				throw new ServiceError(ERROR_CODES.shopForbidden, 403);
			}

			const updated: string[] = [];
			for (const product of products) {
				if (product.status === input.status) continue;
				await req.payload.update({
					collection: "products",
					id: product.id,
					req,
					overrideAccess: true,
					context: PRODUCT_SERVICE_CONTEXT,
					data: { status: input.status },
				});
				await syncProductListing(req, String(product.id));
				updated.push(String(product.id));
			}
			return { updated };
		},
		{ user },
	);
}
