import type { Payload, PayloadRequest } from "payload";
import {
	can,
	resolveShopRole,
	type ShopPermission,
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
 * Every shop route and service starts here. The permission, not the role, is
 * what a caller names: `can` owns the table and nothing else compares a role
 * string.
 */
export async function requireShopPermission(
	payload: Payload,
	user: ServiceUser,
	shopId: string,
	permission: ShopPermission,
	options: { writable?: boolean; req?: PayloadRequest } = {},
): Promise<{ shop: Shop; role: ShopRole }> {
	const shop = await findShop(payload, shopId, options.req);
	const role = await resolveShopRole(
		payload,
		user.id,
		String(shop.id),
		options.req?.context,
	);

	if (!role) throw new ServiceError(ERROR_CODES.shopNotMember, 403);
	if (!can(role, permission))
		throw new ServiceError(ERROR_CODES.shopForbidden, 403);

	if (options.writable) {
		await assertNotSuspended(payload, user.id, user as SuspensionCheckable);
		if (shop.status !== "active")
			throw new ServiceError(ERROR_CODES.shopInactive, 409);
	}

	return { shop, role };
}

/**
 * "Any active member", plus the two legacy shapes. `manage: true` is
 * `settings.edit` and `owner: true` is the role itself — a permission cannot
 * express "the owner and nobody else" for a permission every manager also
 * holds, which is why `owner` stays a role check here and the genuinely
 * owner-only levers name `settings.handle` or `shop.close` instead.
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
	const result = await requireShopPermission(
		payload,
		user,
		shopId,
		options.manage ? "settings.edit" : "team.view",
		{ writable: options.writable, req: options.req },
	);
	if (options.owner && result.role !== "owner")
		throw new ServiceError(ERROR_CODES.shopNotMember, 403);
	return result;
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
