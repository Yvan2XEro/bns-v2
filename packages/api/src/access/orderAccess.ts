import type { Payload, PayloadRequest } from "payload";
import { ERROR_CODES } from "../lib/errors";
import { relationId } from "../lib/relationId";
import { ServiceError } from "../lib/serviceError";
import type { Order } from "../payload-types";
import { isModerator } from "./roles";
import {
	can,
	resolveShopRole,
	type ShopPermission,
	type ShopRole,
} from "./shopRoles";

/**
 * The caller's standing on one order. Staff is checked first in
 * `resolveOrderAudience`: a moderator who is incidentally the buyer or a
 * member of the fulfilling shop still arbitrates as staff, not as a party —
 * there is exactly one audience per caller, never two at once.
 */
export type OrderAudience =
	| { kind: "buyer" }
	| { kind: "shop"; role: ShopRole }
	| { kind: "staff" };

/** The caller shape every route and service passes in; `role` drives `isModerator`. */
export interface OrderViewer {
	id: string;
	role?: string | null;
}

/**
 * Resolves the caller's audience for an already-loaded order, or `null` for
 * a stranger. Order matters: staff before buyer before shop, so a moderator
 * never gets double-counted as a party, and the buyer check runs before the
 * shop lookup so a buyer who also happens to staff their own alt shop (not a
 * real case today, but not one this function should get wrong either) reads
 * as the buyer.
 */
export async function resolveOrderAudience(
	payload: Payload,
	user: OrderViewer | null | undefined,
	order: Order,
	req?: PayloadRequest,
): Promise<OrderAudience | null> {
	if (!user) return null;
	if (isModerator(user)) return { kind: "staff" };
	if (relationId(order.buyer) === user.id) return { kind: "buyer" };
	const role = await resolveShopRole(
		payload,
		user.id,
		relationId(order.shop),
		req?.context,
	);
	if (role) return { kind: "shop", role };
	return null;
}

async function loadOrder(
	payload: Payload,
	orderId: string,
	req?: PayloadRequest,
): Promise<Order> {
	try {
		return await payload.findByID({
			collection: "orders",
			id: orderId,
			depth: 0,
			overrideAccess: true,
			req,
		});
	} catch {
		throw new ServiceError(ERROR_CODES.orderNotFound, 404);
	}
}

/**
 * Loads the order and resolves the caller's audience in one call — the one
 * entry point every read route is expected to use. A stranger (signed out or
 * signed in but unrelated to the order) gets `order.notFound`, never a 403:
 * a 403 would confirm the order exists, which is itself information a
 * stranger has no business getting.
 */
export async function requireOrderAudience(
	payload: Payload,
	user: OrderViewer | null | undefined,
	orderId: string,
	req?: PayloadRequest,
): Promise<{ order: Order; audience: OrderAudience }> {
	const order = await loadOrder(payload, orderId, req);
	const audience = await resolveOrderAudience(payload, user, order, req);
	if (!audience) throw new ServiceError(ERROR_CODES.orderNotFound, 404);
	return { order, audience };
}

/**
 * Narrows `requireOrderAudience` to one shop permission, for an action
 * rather than a read. A buyer or a moderator is a real audience for the
 * order but not a shop one, and gets the same `shop.notMember` a genuine
 * non-member would — this is for "may this caller accept/cancel this
 * order", and a buyer triggering a shop-only transition is not a privacy
 * question `order.notFound` needs to answer, it is a plain permission one.
 */
export async function requireOrderShopPermission(
	payload: Payload,
	user: OrderViewer | null | undefined,
	orderId: string,
	permission: ShopPermission,
	req?: PayloadRequest,
): Promise<{ order: Order; role: ShopRole }> {
	const { order, audience } = await requireOrderAudience(
		payload,
		user,
		orderId,
		req,
	);
	if (audience.kind !== "shop") {
		throw new ServiceError(ERROR_CODES.shopNotMember, 403);
	}
	if (!can(audience.role, permission)) {
		throw new ServiceError(ERROR_CODES.shopForbidden, 403);
	}
	return { order, role: audience.role };
}

const BULLET = "•";
/** Cameroon E.164 numbers carry a 9-digit national significant number. */
const NATIONAL_LENGTH = 9;

/**
 * `+237612345678` becomes `+2376••••••78`: country code, the national
 * number's first and last two digits, everything between hidden one bullet
 * per digit. Used only once a delivery phone has aged past
 * `PHONE_MASK_AFTER_TERMINAL_DAYS` on a terminal order — while an order is
 * live, the shop sees the number in full because they may still need to call
 * the buyer.
 */
export function maskPhone(e164: string): string {
	const digits = e164.replace(/\D/g, "");
	const national =
		digits.length > NATIONAL_LENGTH ? digits.slice(-NATIONAL_LENGTH) : digits;
	const cc = digits.slice(0, digits.length - national.length);
	if (national.length <= 3) {
		return `+${cc}${BULLET.repeat(national.length)}`;
	}
	const hidden = national.length - 3;
	return `+${cc}${national[0]}${BULLET.repeat(hidden)}${national.slice(-2)}`;
}

/** How long after an order becomes terminal its delivery phone stays masked for the shop. */
export const PHONE_MASK_AFTER_TERMINAL_DAYS = 30;
