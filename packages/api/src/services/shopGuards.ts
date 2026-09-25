import type { Payload, PayloadRequest } from "payload";
import {
	canManageShop,
	resolveShopRole,
	type ShopRole,
} from "../access/shopRoles";
import {
	assertNotSuspended,
	type SuspensionCheckable,
} from "../hooks/suspensionGuard";
import { ERROR_CODES } from "../lib/errors";
import { type PublicShop, serializePublicShop } from "../lib/publicShop";
import { relationId } from "../lib/relationId";
import { ServiceError } from "../lib/serviceError";
import type { Shop, User } from "../payload-types";
import type { ServiceUser } from "./shops";

export async function findShop(
	payload: Payload,
	shopId: string,
	req?: PayloadRequest,
): Promise<Shop> {
	try {
		return await payload.findByID({
			collection: "shops",
			id: shopId,
			depth: 0,
			overrideAccess: true,
			req,
		});
	} catch {
		throw new ServiceError(ERROR_CODES.shopNotFound, 404);
	}
}

/**
 * Every shop route and service starts here. P3 replaces the role checks with
 * `requireShopPermission`; callers keep passing the same options.
 */
export async function requireShopMember(
	payload: Payload,
	user: ServiceUser,
	shopId: string,
	options: {
		manage?: boolean;
		owner?: boolean;
		writable?: boolean;
		req?: PayloadRequest;
	} = {},
): Promise<{ shop: Shop; role: ShopRole }> {
	const shop = await findShop(payload, shopId, options.req);
	const role = await resolveShopRole(
		payload,
		user.id,
		String(shop.id),
		options.req?.context,
	);

	if (!role) throw new ServiceError(ERROR_CODES.shopNotMember, 403);
	if (options.manage && !canManageShop(role))
		throw new ServiceError(ERROR_CODES.shopNotMember, 403);
	if (options.owner && role !== "owner")
		throw new ServiceError(ERROR_CODES.shopNotMember, 403);

	if (options.writable) {
		await assertNotSuspended(payload, user.id, user as SuspensionCheckable);
		if (shop.status !== "active")
			throw new ServiceError(ERROR_CODES.shopInactive, 409);
	}

	return { shop, role };
}

export async function loadPublicShop(
	payload: Payload,
	shopId: string,
	req?: PayloadRequest,
): Promise<PublicShop> {
	const shop = await payload.findByID({
		collection: "shops",
		id: shopId,
		depth: 1,
		overrideAccess: true,
		req,
	});
	const ownerId = relationId(shop.owner);
	const owner = ownerId
		? ((await payload
				.findByID({
					collection: "users",
					id: ownerId,
					depth: 1,
					overrideAccess: true,
					req,
				})
				.catch(() => null)) as User | null)
		: null;
	return serializePublicShop(shop, owner);
}
