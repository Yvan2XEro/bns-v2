import { randomUUID } from "node:crypto";
import type { Payload, PayloadRequest } from "payload";
import { resolveShopRole } from "../access/shopRoles";
import { ERROR_CODES, type ErrorCode } from "../lib/errors";
import { isLaunchCityKey } from "../lib/launchCities";
import { getOrderSettings, type OrderSettings } from "../lib/orderSettings";
import { relationId } from "../lib/relationId";
import { ServiceError } from "../lib/serviceError";
import { type TxReq, withTransaction } from "../lib/transactions";
import { availableOf } from "../lib/variants";
import type { Cart, Listing, ProductVariant } from "../payload-types";
import { isUniqueViolation, type ServiceUser } from "./shops";

export class CartError extends ServiceError {
	constructor(
		code: ErrorCode,
		status: number,
		message?: string,
		details?: Record<string, unknown>,
	) {
		super(code, status, message, details);
		this.name = "CartError";
	}
}

/** Mirrors the Carts collection's own `items.quantity` field (`min: 1, max: 20`). */
const MIN_QUANTITY = 1;
const MAX_QUANTITY = 20;

type CartItem = NonNullable<Cart["items"]>[number];

export interface AddCartItemInput {
	listingId: unknown;
	variantId: unknown;
	quantity: unknown;
	replace?: unknown;
}

export interface CartLineView {
	id: string;
	listingId: string;
	productId: string;
	variantId: string;
	shopId: string;
	title: string;
	quantity: number;
	priceAtAdd: number;
	/** Null only when the listing or variant can no longer be read at all. */
	currentPrice: number | null;
	priceChanged: boolean;
	unavailable: boolean;
	unavailableCode: ErrorCode | null;
	/** Set only when `unavailableCode` is `cart.outOfStock`. */
	maxQuantity: number | null;
}

export interface CartView {
	id: string | null;
	shopId: string | null;
	lines: CartLineView[];
	subtotal: number;
	itemCount: number;
	hasUnavailable: boolean;
}

function parseQuantity(value: unknown): number {
	const quantity = typeof value === "number" ? value : Number(value);
	if (
		!Number.isInteger(quantity) ||
		quantity < MIN_QUANTITY ||
		quantity > MAX_QUANTITY
	) {
		throw new CartError(ERROR_CODES.cartQuantityInvalid, 400);
	}
	return quantity;
}

function lineIdOf(value: unknown): string | null {
	if (typeof value === "string" && value) return value;
	return null;
}

async function requireEnabled(payload: Payload): Promise<OrderSettings> {
	const settings = await getOrderSettings(payload);
	if (!settings.enabled) {
		throw new CartError(ERROR_CODES.checkoutDisabled, 403);
	}
	return settings;
}

/**
 * The seven reasons a listing/variant pair cannot be ordered right now, as
 * one shared check: `addCartItem` throws on the first one it meets,
 * `revalidateCartLines` reads the same reason to flag a line without
 * dropping it. A variant archived after it was added and a listing taken
 * down after it was added both resolve to the same reason here, so the two
 * call sites can never drift on what "unavailable" means.
 */
async function orderabilityReason(
	payload: Payload,
	listing: Listing,
	variant: ProductVariant,
	settings: OrderSettings,
): Promise<
	| "unpublished"
	| "shopInactive"
	| "shopRestricted"
	| "codDisabled"
	| "cityNotLaunch"
	| "codNotAllowed"
	| "variantArchived"
	| null
> {
	if (listing.status !== "published") return "unpublished";

	const shopId = relationId(listing.shop);
	const shop = shopId
		? await payload
				.findByID({
					collection: "shops",
					id: shopId,
					depth: 0,
					overrideAccess: true,
				})
				.catch(() => null)
		: null;
	if (!shop || shop.status !== "active") return "shopInactive";
	if (shop.ordersRestrictedAt) return "shopRestricted";
	if (shop.orderSettings?.codEnabled !== true) return "codDisabled";
	const city = shop.location?.city;
	if (
		!city ||
		!isLaunchCityKey(city) ||
		!settings.launchCities.some((entry) => entry.key === city)
	) {
		return "cityNotLaunch";
	}

	const productId = relationId(variant.product);
	const product = productId
		? await payload
				.findByID({
					collection: "products",
					id: productId,
					depth: 0,
					overrideAccess: true,
				})
				.catch(() => null)
		: null;
	if (product?.delivery?.codAllowed === false) return "codNotAllowed";

	if (variant.archivedAt) return "variantArchived";

	return null;
}

async function assertOrderable(
	payload: Payload,
	listing: Listing,
	variant: ProductVariant,
	settings: OrderSettings,
): Promise<void> {
	const reason = await orderabilityReason(payload, listing, variant, settings);
	if (reason) throw new CartError(ERROR_CODES.cartItemUnavailable, 409);
}

/**
 * The active cart for a user, or null. A plain read with no side effects:
 * Tasks 18 and 19 (checkout, order placement) load the buyer's cart through
 * this, same as every route here.
 */
export async function loadActiveCart(
	payload: Payload,
	userId: string,
	req?: TxReq,
): Promise<Cart | null> {
	const result = await payload.find({
		collection: "carts",
		where: {
			and: [{ user: { equals: userId } }, { status: { equals: "active" } }],
		},
		limit: 1,
		depth: 0,
		overrideAccess: true,
		req,
	});
	return (result.docs[0] as Cart | undefined) ?? null;
}

/**
 * What is currently true for every line of `cart`, re-read rather than
 * trusted from the stored `priceAtAdd` and the row's existence: a line whose
 * variant was archived or whose stock ran out is flagged, never dropped, so
 * the buyer sees what happened instead of a cart that quietly shrank.
 */
export async function revalidateCartLines(
	payload: Payload,
	cart: Cart | null,
	req?: TxReq,
): Promise<CartLineView[]> {
	const items = cart?.items ?? [];
	if (items.length === 0) return [];

	const settings = await getOrderSettings(payload);
	const lines: CartLineView[] = [];

	for (const item of items) {
		const listingId = relationId(item.listing);
		const variantId = relationId(item.variant);
		const productId = relationId(item.product);
		const shopId = relationId(item.shop);

		const listing = listingId
			? await payload
					.findByID({
						collection: "listings",
						id: listingId,
						depth: 0,
						overrideAccess: true,
						req,
					})
					.catch(() => null)
			: null;
		const variant = variantId
			? await payload
					.findByID({
						collection: "product-variants",
						id: variantId,
						depth: 0,
						overrideAccess: true,
						req,
					})
					.catch(() => null)
			: null;

		let unavailable = false;
		let unavailableCode: CartLineView["unavailableCode"] = null;
		let maxQuantity: number | null = null;
		let currentPrice: number | null = null;

		if (!listing || !variant) {
			unavailable = true;
			unavailableCode = ERROR_CODES.cartItemUnavailable;
		} else {
			currentPrice = variant.price;
			const reason = await orderabilityReason(
				payload,
				listing,
				variant,
				settings,
			);
			if (reason) {
				unavailable = true;
				unavailableCode = ERROR_CODES.cartItemUnavailable;
			} else if (variant.trackInventory === true) {
				const available = availableOf(variant);
				if (item.quantity > available) {
					unavailable = true;
					unavailableCode = ERROR_CODES.cartOutOfStock;
					maxQuantity = available;
				}
			}
		}

		lines.push({
			id: String(item.id ?? ""),
			listingId: listingId ?? "",
			productId: productId ?? "",
			variantId: variantId ?? "",
			shopId: shopId ?? "",
			title: listing?.title ?? "",
			quantity: item.quantity,
			priceAtAdd: item.priceAtAdd,
			currentPrice,
			priceChanged: currentPrice !== null && currentPrice !== item.priceAtAdd,
			unavailable,
			unavailableCode,
			maxQuantity,
		});
	}

	return lines;
}

async function toCartView(
	payload: Payload,
	cart: Cart | null,
	req?: TxReq,
): Promise<CartView> {
	const lines = await revalidateCartLines(payload, cart, req);
	const subtotal = lines.reduce(
		(sum, line) =>
			sum + (line.unavailable ? 0 : (line.currentPrice ?? 0) * line.quantity),
		0,
	);
	const itemCount = lines.reduce(
		(sum, line) => sum + (line.unavailable ? 0 : line.quantity),
		0,
	);
	return {
		id: cart ? String(cart.id) : null,
		shopId: lines[0]?.shopId ?? null,
		lines,
		subtotal,
		itemCount,
		hasUnavailable: lines.some((line) => line.unavailable),
	};
}

export async function getCartView(
	payload: Payload,
	user: ServiceUser,
): Promise<CartView> {
	await requireEnabled(payload);
	const cart = await loadActiveCart(payload, user.id);
	return toCartView(payload, cart);
}

function newItemRow(input: {
	listing: Listing;
	variant: ProductVariant;
	shopId: string;
	quantity: number;
}): CartItem {
	return {
		id: randomUUID(),
		listing: input.listing.id,
		product: relationId(input.variant.product) ?? "",
		variant: input.variant.id,
		shop: input.shopId,
		quantity: input.quantity,
		priceAtAdd: input.variant.price,
		addedAt: new Date().toISOString(),
	};
}

/**
 * Adds the item to `cart` (or creates the active cart, if `cart` is null),
 * enforcing the single-shop rule and merging into an existing line for the
 * same variant. Recurses exactly once: creating a fresh cart can lose the
 * partial-unique-index race to a concurrent "add to cart" from the same
 * user, and the recovery is to re-read the cart that race produced and
 * apply this same item to it — not to duplicate the check the index already
 * wins.
 */
async function applyAddToCart(
	payload: Payload,
	req: PayloadRequest,
	userId: string,
	cart: Cart | null,
	input: {
		listing: Listing;
		variant: ProductVariant;
		shopId: string;
		quantity: number;
	},
): Promise<Cart> {
	const items = cart?.items ?? [];

	if (items.length > 0) {
		const currentShopId = relationId(items[0].shop);
		if (currentShopId && currentShopId !== input.shopId) {
			const currentShop = await payload
				.findByID({
					collection: "shops",
					id: currentShopId,
					depth: 0,
					overrideAccess: true,
					req,
				})
				.catch(() => null);
			throw new CartError(ERROR_CODES.cartSingleShop, 409, undefined, {
				currentShop: {
					id: currentShopId,
					name: currentShop?.name ?? null,
				},
			});
		}
	}

	const existingLine = items.find(
		(item) => relationId(item.variant) === input.variant.id,
	);
	const mergedQuantity = (existingLine?.quantity ?? 0) + input.quantity;
	if (mergedQuantity > MAX_QUANTITY) {
		throw new CartError(ERROR_CODES.cartQuantityInvalid, 400);
	}
	if (input.variant.trackInventory === true) {
		const available = availableOf(input.variant);
		if (mergedQuantity > available) {
			throw new CartError(ERROR_CODES.cartOutOfStock, 409, undefined, {
				maxQuantity: available,
			});
		}
	}

	if (!cart) {
		try {
			return await payload.create({
				collection: "carts",
				overrideAccess: true,
				req,
				data: {
					user: userId,
					status: "active",
					items: [newItemRow(input)],
					lastActivityAt: new Date().toISOString(),
				},
			});
		} catch (error) {
			if (!isUniqueViolation(error)) throw error;
			const recovered = await loadActiveCart(payload, userId, req);
			if (!recovered) throw error;
			return applyAddToCart(payload, req, userId, recovered, input);
		}
	}

	const nextItems = existingLine
		? items.map((item) =>
				item.id === existingLine.id
					? { ...item, quantity: mergedQuantity }
					: item,
			)
		: [...items, newItemRow(input)];

	return payload.update({
		collection: "carts",
		id: cart.id,
		overrideAccess: true,
		req,
		data: { items: nextItems, lastActivityAt: new Date().toISOString() },
	});
}

export async function addCartItem(
	payload: Payload,
	user: ServiceUser,
	input: AddCartItemInput,
): Promise<CartView> {
	const settings = await requireEnabled(payload);
	const quantity = parseQuantity(input.quantity);
	const listingId = relationId(input.listingId);
	const variantId = relationId(input.variantId);
	if (!listingId || !variantId) {
		throw new CartError(ERROR_CODES.cartItemUnavailable, 409);
	}
	const replace = input.replace === true;

	return withTransaction(payload, async (req) => {
		const listing = await payload
			.findByID({
				collection: "listings",
				id: listingId,
				depth: 0,
				overrideAccess: true,
				req,
			})
			.catch(() => null);
		const variant = await payload
			.findByID({
				collection: "product-variants",
				id: variantId,
				depth: 0,
				overrideAccess: true,
				req,
			})
			.catch(() => null);
		if (!listing || !variant) {
			throw new CartError(ERROR_CODES.cartItemUnavailable, 409);
		}

		const shopId = relationId(listing.shop);
		if (!shopId) throw new CartError(ERROR_CODES.cartItemUnavailable, 409);

		const role = await resolveShopRole(payload, user.id, shopId, req.context);
		if (role) throw new CartError(ERROR_CODES.checkoutSelfPurchase, 403);

		await assertOrderable(payload, listing, variant, settings);

		let cart = await loadActiveCart(payload, user.id, req);
		if (replace && cart && (cart.items?.length ?? 0) > 0) {
			cart = await payload.update({
				collection: "carts",
				id: cart.id,
				overrideAccess: true,
				req,
				data: { items: [] },
			});
		}

		const updated = await applyAddToCart(payload, req, user.id, cart, {
			listing,
			variant,
			shopId,
			quantity,
		});
		return toCartView(payload, updated, req);
	});
}

export async function setCartItemQuantity(
	payload: Payload,
	user: ServiceUser,
	lineId: unknown,
	quantity: unknown,
): Promise<CartView> {
	await requireEnabled(payload);
	const qty = parseQuantity(quantity);
	const line = lineIdOf(lineId);
	if (!line) throw new ServiceError(ERROR_CODES.notFound, 404);

	return withTransaction(payload, async (req) => {
		const cart = await loadActiveCart(payload, user.id, req);
		const item = cart?.items?.find((row) => row.id === line);
		if (!cart || !item) throw new ServiceError(ERROR_CODES.notFound, 404);

		const variantId = relationId(item.variant);
		const variant = variantId
			? await payload
					.findByID({
						collection: "product-variants",
						id: variantId,
						depth: 0,
						overrideAccess: true,
						req,
					})
					.catch(() => null)
			: null;
		if (variant?.trackInventory === true) {
			const available = availableOf(variant);
			if (qty > available) {
				throw new CartError(ERROR_CODES.cartOutOfStock, 409, undefined, {
					maxQuantity: available,
				});
			}
		}

		const nextItems = (cart.items ?? []).map((row) =>
			row.id === line ? { ...row, quantity: qty } : row,
		);
		const updated = await payload.update({
			collection: "carts",
			id: cart.id,
			overrideAccess: true,
			req,
			data: { items: nextItems, lastActivityAt: new Date().toISOString() },
		});
		return toCartView(payload, updated, req);
	});
}

export async function removeCartItem(
	payload: Payload,
	user: ServiceUser,
	lineId: unknown,
): Promise<CartView> {
	await requireEnabled(payload);
	const line = lineIdOf(lineId);
	if (!line) throw new ServiceError(ERROR_CODES.notFound, 404);

	return withTransaction(payload, async (req) => {
		const cart = await loadActiveCart(payload, user.id, req);
		const exists = cart?.items?.some((row) => row.id === line);
		if (!cart || !exists) throw new ServiceError(ERROR_CODES.notFound, 404);

		const nextItems = (cart.items ?? []).filter((row) => row.id !== line);
		const updated = await payload.update({
			collection: "carts",
			id: cart.id,
			overrideAccess: true,
			req,
			data: { items: nextItems, lastActivityAt: new Date().toISOString() },
		});
		return toCartView(payload, updated, req);
	});
}

export async function clearCart(
	payload: Payload,
	user: ServiceUser,
): Promise<CartView> {
	await requireEnabled(payload);

	return withTransaction(payload, async (req) => {
		const cart = await loadActiveCart(payload, user.id, req);
		if (!cart) return toCartView(payload, null, req);

		const updated = await payload.update({
			collection: "carts",
			id: cart.id,
			overrideAccess: true,
			req,
			data: { items: [], lastActivityAt: new Date().toISOString() },
		});
		return toCartView(payload, updated, req);
	});
}

/**
 * Called by checkout (Tasks 18/19) inside their own transaction, once the
 * orders it produced exist — hence `req`, not `payload`: the write joins
 * whatever transaction placed the order rather than opening its own.
 */
export async function markCartConverted(
	req: PayloadRequest,
	cartId: string,
	orderIds: string[],
): Promise<void> {
	await req.payload.update({
		collection: "carts",
		id: cartId,
		overrideAccess: true,
		req,
		data: { status: "converted", convertedOrders: orderIds },
	});
}
