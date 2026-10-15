import { randomUUID } from "node:crypto";
import type { Payload, PayloadRequest } from "payload";
import { resolveShopRole } from "../access/shopRoles";
import type {
	CartLineView,
	CartShopView,
	SplitCartGroup,
	SplitCartView,
} from "../contracts/checkoutGroup";
import { ERROR_CODES, type ErrorCode } from "../lib/errors";
import { launchCityKeyOf } from "../lib/launchCities";
import {
	getMarkets,
	liveMarketOfShop,
	type Market,
	marketOfShop,
} from "../lib/markets";
import { getOrderSettings, type OrderSettings } from "../lib/orderSettings";
import { relationId } from "../lib/relationId";
import { ServiceError } from "../lib/serviceError";
import { shopCapabilities } from "../lib/shopCapabilities";
import { type TxReq, withTransaction } from "../lib/transactions";
import { availableOf, PUBLIC_STOCK_CAP, variantLabel } from "../lib/variants";
import type { Cart, Listing, ProductVariant, Shop } from "../payload-types";
import { cartRetailPrice, resolveCartOffer } from "./cartOffer";
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

export type {
	CartLineView,
	CartShopView,
	SplitCartGroup,
	SplitCartView,
} from "../contracts/checkoutGroup";

/**
 * One line plus the refusal code behind an unavailable one. Internal: the code
 * is what `assertCheckoutPreconditions` answers with, and it never reaches the
 * wire — `available` and `maxQuantity` are what a cart screen needs, and a
 * per-line error code on a list is a second vocabulary for the same facts.
 */
export interface CartLineState extends CartLineView {
	unavailableCode: ErrorCode | null;
	/** The resale supplier when the listing is one, else the storefront; the group key's second half. */
	fulfillingShopId: string;
}

export interface CartView {
	/** Null when the buyer has no active cart. */
	id: string | null;
	shop: CartShopView | null;
	lines: CartLineView[];
	subtotal: number;
	/** False when the shop itself cannot take an order right now — closed, restricted, COD off, or outside the launch cities — whatever each individual line says. */
	shopOrderable: boolean;
	/** Null while the cart names no shop, hence no market. */
	currency: string | null;
}

/** Bounds the plan's M6 pins for a multi-shop cart. */
const MAX_CART_GROUPS = 5;
const MAX_CART_LINES = 30;

export const groupKeyOf = (storefrontId: string, fulfillingId: string) =>
	`${storefrontId}:${fulfillingId}`;

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

type ShopOrderabilityReason =
	| "shopInactive"
	| "shopRestricted"
	| "codDisabled"
	| "cityNotLaunch";

type OrderabilityReason =
	| ShopOrderabilityReason
	| "unpublished"
	| "codNotAllowed"
	| "resaleUnavailable"
	| "variantArchived";

async function loadShop(
	payload: Payload,
	shopId: string | null,
	req?: TxReq,
): Promise<Shop | null> {
	if (!shopId) return null;
	return payload
		.findByID({
			collection: "shops",
			id: shopId,
			depth: 0,
			overrideAccess: true,
			req,
		})
		.catch(() => null);
}

/**
 * The four reasons a shop cannot take an order at all, whatever is in the
 * cart. Split out of `orderabilityReason` because `CartView.shopOrderable` is
 * exactly this answer, and recomputing it line by line would let the cart
 * banner and a line's own flag disagree.
 */
export function shopOrderabilityReason(
	shop: Shop | null,
	settings: OrderSettings,
): ShopOrderabilityReason | null {
	if (!shop || shop.status !== "active") return "shopInactive";
	if (shop.ordersRestrictedAt) return "shopRestricted";
	if (shop.orderSettings?.codEnabled !== true) return "codDisabled";
	const city = launchCityKeyOf(shop.location?.city);
	if (!city || !settings.launchCities.some((entry) => entry.key === city)) {
		return "cityNotLaunch";
	}
	return null;
}

/**
 * The seven reasons a listing/variant pair cannot be ordered right now, as
 * one shared check: `addCartItem` throws on the first one it meets,
 * `revalidateCartLines` reads the same reason to flag a line without
 * dropping it. A variant archived after it was added and a listing taken
 * down after it was added both resolve to the same reason here, so the two
 * call sites can never drift on what "unavailable" means.
 *
 * `shop` is the already-loaded shop when the caller holds it (the cart view
 * loads it once for every line); without it the listing's own shop is read.
 */
async function orderabilityReason(
	payload: Payload,
	listing: Listing,
	variant: ProductVariant,
	settings: OrderSettings,
	shop?: Shop | null,
	req?: TxReq,
): Promise<OrderabilityReason | null> {
	if (listing.status !== "published") return "unpublished";

	const resolvedShop =
		shop === undefined
			? await loadShop(payload, relationId(listing.shop), req)
			: shop;
	const shopReason = shopOrderabilityReason(resolvedShop, settings);
	if (shopReason) return shopReason;
	if (listing.resale?.supplierShop) {
		if (!resolvedShop) return "resaleUnavailable";
		try {
			const offer = await resolveCartOffer(
				payload,
				listing,
				variant,
				resolvedShop,
				req,
			);
			if (shopOrderabilityReason(offer.fulfillingShop, settings))
				return "resaleUnavailable";
		} catch (error) {
			if (error instanceof ServiceError) return "resaleUnavailable";
			throw error;
		}
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
): Promise<CartLineState[]> {
	return (await revalidateCart(payload, cart, req)).lines;
}

function firstImageUrl(listing: Listing | null): string | null {
	const image = listing?.images?.[0]?.image;
	if (!image || typeof image !== "object") return null;
	return typeof image.url === "string" && image.url ? image.url : null;
}

/**
 * The cart's lines plus the one shop they all belong to, loaded once. The
 * single-shop rule (`cart.singleShop`) is what makes one shop read enough for
 * every line — `applyAddToCart` refuses a second one.
 */
async function revalidateCart(
	payload: Payload,
	cart: Cart | null,
	req?: TxReq,
): Promise<{
	lines: CartLineState[];
	shop: Shop | null;
	shops: Map<string, Shop | null>;
}> {
	const items = cart?.items ?? [];
	if (items.length === 0) return { lines: [], shop: null, shops: new Map() };

	const settings = await getOrderSettings(payload);
	const shop = await loadShop(payload, relationId(items[0].shop), req);
	const shops = new Map<string, Shop | null>([
		[relationId(items[0].shop) ?? "", shop],
	]);
	const lines: CartLineState[] = [];

	for (const item of items) {
		const listingId = relationId(item.listing);
		const variantId = relationId(item.variant);
		const productId = relationId(item.product);
		const shopId = relationId(item.shop);
		// One shop reads for the whole cart unless the flag lets lines differ.
		let lineShop = shop;
		if (settings.multiShopCartEnabled && shopId) {
			if (!shops.has(shopId))
				shops.set(shopId, await loadShop(payload, shopId, req));
			lineShop = shops.get(shopId) ?? null;
		}

		// `depth: 1` so the first image arrives as a Media document: `imageUrl`
		// is the one line field a client cannot resolve from an id.
		const listing = listingId
			? await payload
					.findByID({
						collection: "listings",
						id: listingId,
						depth: 1,
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

		let available = true;
		let unavailableCode: ErrorCode | null = null;
		let maxQuantity: number | null = null;
		let currentPrice: number | null = null;

		if (!listing || !variant) {
			available = false;
			unavailableCode = ERROR_CODES.cartItemUnavailable;
		} else {
			currentPrice = cartRetailPrice(listing, variant);
			const reason = await orderabilityReason(
				payload,
				listing,
				variant,
				settings,
				lineShop,
				req,
			);
			if (variant.trackInventory === true) maxQuantity = availableOf(variant);
			if (reason) {
				available = false;
				unavailableCode = ERROR_CODES.cartItemUnavailable;
			} else if (maxQuantity !== null && item.quantity > maxQuantity) {
				available = false;
				unavailableCode = ERROR_CODES.cartOutOfStock;
			}
		}

		const unitPrice = currentPrice ?? item.priceAtAdd;
		lines.push({
			id: String(item.id ?? ""),
			listingId: listingId ?? "",
			productId: productId ?? "",
			variantId: variantId ?? "",
			shopId: shopId ?? "",
			title: listing?.title ?? "",
			variantLabel: variantLabel(variant?.optionValues),
			imageUrl: firstImageUrl(listing),
			quantity: item.quantity,
			unitPrice,
			priceAtAdd: item.priceAtAdd,
			priceChanged: currentPrice !== null && currentPrice !== item.priceAtAdd,
			lineSubtotal: unitPrice * item.quantity,
			available,
			maxQuantity,
			stockLeft:
				maxQuantity !== null && maxQuantity <= PUBLIC_STOCK_CAP
					? maxQuantity
					: null,
			unavailableCode,
			fulfillingShopId:
				relationId(listing?.resale?.supplierShop) ?? shopId ?? "",
		});
	}

	return { lines, shop, shops };
}

/** The wire line: `unavailableCode` stays behind, every other field is the contract's. */
function toLineView(line: CartLineState): CartLineView {
	return {
		id: line.id,
		listingId: line.listingId,
		productId: line.productId,
		variantId: line.variantId,
		shopId: line.shopId,
		title: line.title,
		variantLabel: line.variantLabel,
		imageUrl: line.imageUrl,
		quantity: line.quantity,
		unitPrice: line.unitPrice,
		priceAtAdd: line.priceAtAdd,
		priceChanged: line.priceChanged,
		lineSubtotal: line.lineSubtotal,
		available: line.available,
		maxQuantity: line.maxQuantity,
		stockLeft: line.stockLeft ?? null,
	};
}

/**
 * What the cart's shop header shows beyond the name: logo, verification badge
 * and rating. `loadShop` reads at depth 0, so a logo still stored as an id is
 * resolved here rather than deepening every orderability read.
 */
async function shopHeaderOf(
	payload: Payload,
	shop: Shop | null,
	req?: TxReq,
): Promise<
	Pick<CartShopView, "logoUrl" | "badge" | "rating" | "totalReviews">
> {
	if (!shop) return { logoUrl: null, badge: null, rating: 0, totalReviews: 0 };
	let logoUrl: string | null = null;
	if (shop.logo && typeof shop.logo === "object") {
		logoUrl = shop.logo.url ?? null;
	} else if (typeof shop.logo === "string") {
		const media = await payload
			.findByID({
				collection: "media",
				id: shop.logo,
				depth: 0,
				overrideAccess: true,
				req,
			})
			.catch(() => null);
		logoUrl = media?.url ?? null;
	}
	return {
		logoUrl,
		badge: shopCapabilities(shop).badge,
		rating: shop.rating ?? 0,
		totalReviews: shop.totalReviews ?? 0,
	};
}

async function toCartView(
	payload: Payload,
	cart: Cart | null,
	req?: TxReq,
): Promise<CartView> {
	const { lines, shop } = await revalidateCart(payload, cart, req);
	const settings = await getOrderSettings(payload);
	const market = shop ? await liveMarketOfShop(payload, shop) : null;
	const subtotal = lines.reduce(
		(sum, line) => sum + (line.available ? line.lineSubtotal : 0),
		0,
	);
	return {
		id: cart ? String(cart.id) : null,
		shop: shop
			? {
					id: String(shop.id),
					name: shop.name,
					handle: shop.handle,
					city:
						launchCityKeyOf(shop.location?.city) ?? shop.location?.city ?? null,
					...(await shopHeaderOf(payload, shop, req)),
				}
			: null,
		lines: lines.map(toLineView),
		subtotal,
		shopOrderable:
			lines.length > 0 && shopOrderabilityReason(shop, settings) === null,
		currency: market?.currency.code ?? null,
	};
}

export const summaryOf = (shop: Shop | null, id: string): CartShopView => ({
	id,
	name: shop?.name ?? "",
	handle: shop?.handle ?? "",
	city: shop?.location?.city ?? null,
});

async function toSplitCartView(
	payload: Payload,
	cart: Cart | null,
	req?: TxReq,
): Promise<SplitCartView> {
	const { lines, shop, shops } = await revalidateCart(payload, cart, req);
	if (lines.length === 0 || !shop) {
		return {
			id: cart ? String(cart.id) : null,
			market: null,
			groups: [],
			grandSubtotal: 0,
		};
	}
	const storedId = relationId(cart?.market);
	const market =
		(storedId
			? (await getMarkets(payload)).find((m) => m.id === storedId)
			: undefined) ?? (await liveMarketOfShop(payload, shop));

	const groups = new Map<string, SplitCartGroup>();
	for (const line of lines) {
		const key = groupKeyOf(line.shopId, line.fulfillingShopId);
		let group = groups.get(key);
		if (!group) {
			const resale = line.fulfillingShopId !== line.shopId;
			if (resale && !shops.has(line.fulfillingShopId))
				shops.set(
					line.fulfillingShopId,
					await loadShop(payload, line.fulfillingShopId, req),
				);
			const fulfilling = shops.get(line.fulfillingShopId) ?? null;
			group = {
				groupKey: key,
				storefrontShop: summaryOf(shops.get(line.shopId) ?? null, line.shopId),
				fulfillingShop: {
					...summaryOf(fulfilling, line.fulfillingShopId),
					...(await shopHeaderOf(payload, fulfilling, req)),
				},
				resale,
				items: [],
				subtotal: 0,
			};
			groups.set(key, group);
		}
		group.items.push(toLineView(line));
		if (line.available) group.subtotal += line.lineSubtotal;
	}
	const list = [...groups.values()];
	return {
		id: cart ? String(cart.id) : null,
		market: { countryCode: market.countryCode, currency: market.currency.code },
		groups: list,
		grandSubtotal: list.reduce((sum, group) => sum + group.subtotal, 0),
	};
}

/** The flag decides which shape the wire gets; the legacy renderer stays the default. */
async function toCartResponse(
	payload: Payload,
	cart: Cart | null,
	req?: TxReq,
): Promise<CartView | SplitCartView> {
	const settings = await getOrderSettings(payload);
	return settings.multiShopCartEnabled
		? toSplitCartView(payload, cart, req)
		: toCartView(payload, cart, req);
}

type Render<T> = (
	payload: Payload,
	cart: Cart | null,
	req?: TxReq,
) => Promise<T>;

async function getCartWith<T>(
	payload: Payload,
	user: ServiceUser,
	render: Render<T>,
): Promise<T> {
	await requireEnabled(payload);
	const cart = await loadActiveCart(payload, user.id);
	return render(payload, cart);
}

export const getCartView = (payload: Payload, user: ServiceUser) =>
	getCartWith(payload, user, toCartView);
export const getCartResponse = (payload: Payload, user: ServiceUser) =>
	getCartWith(payload, user, toCartResponse);

function newItemRow(input: {
	listing: Listing;
	variant: ProductVariant;
	shopId: string;
	quantity: number;
	unitPrice: number;
}): CartItem {
	return {
		id: randomUUID(),
		listing: input.listing.id,
		product: relationId(input.variant.product) ?? "",
		variant: input.variant.id,
		shop: input.shopId,
		quantity: input.quantity,
		priceAtAdd: input.unitPrice,
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
		unitPrice: number;
		multiShop: boolean;
		/** The incoming line's market, written only when the cart holds no line yet. */
		marketId: string | null;
	},
): Promise<Cart> {
	const items = cart?.items ?? [];
	const incomingFulfilment =
		relationId(input.listing.resale?.supplierShop) ?? input.shopId;

	const fulfilmentOf = async (item: CartItem): Promise<string> => {
		const listingId = relationId(item.listing);
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
		return (
			relationId(listing?.resale?.supplierShop) ?? relationId(item.shop) ?? ""
		);
	};

	if (items.length > 0 && !input.multiShop) {
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
		for (const item of items) {
			if ((await fulfilmentOf(item)) !== incomingFulfilment)
				throw new CartError(ERROR_CODES.cartSingleFulfilment, 409);
		}
	}

	const existingLine = items.find((item) =>
		input.multiShop
			? relationId(item.variant) === input.variant.id &&
				relationId(item.listing) === input.listing.id
			: relationId(item.variant) === input.variant.id,
	);

	if (input.multiShop && items.length > 0) {
		const keys = new Set<string>();
		for (const item of items)
			keys.add(
				groupKeyOf(relationId(item.shop) ?? "", await fulfilmentOf(item)),
			);
		const newGroup = !keys.has(groupKeyOf(input.shopId, incomingFulfilment));
		if (
			(newGroup && keys.size + 1 > MAX_CART_GROUPS) ||
			(!existingLine && items.length + 1 > MAX_CART_LINES)
		)
			throw new CartError(ERROR_CODES.cartShopLimitReached, 409);
	}

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
					...(input.marketId ? { market: input.marketId } : {}),
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
		data: {
			items: nextItems,
			...(items.length === 0 && input.marketId
				? { market: input.marketId }
				: {}),
			lastActivityAt: new Date().toISOString(),
		},
	});
}

async function marketOfShopOrNull(
	payload: Payload,
	shop: Shop | null,
): Promise<Market | null> {
	if (!shop) return null;
	try {
		return await marketOfShop(payload, shop);
	} catch (error) {
		if (error instanceof ServiceError) return null;
		throw error;
	}
}

/** The market the cart is bound to: its stored row, else the first line's shop's. */
async function marketOfCart(
	payload: Payload,
	cart: Cart,
	req: PayloadRequest,
): Promise<Market | null> {
	const storedId = relationId(cart.market);
	if (storedId)
		return (await getMarkets(payload)).find((m) => m.id === storedId) ?? null;
	const first = cart.items?.[0];
	return marketOfShopOrNull(
		payload,
		await loadShop(payload, first ? relationId(first.shop) : null, req),
	);
}

async function addCartItemWith<T>(
	payload: Payload,
	user: ServiceUser,
	input: AddCartItemInput,
	render: Render<T>,
): Promise<T> {
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
		const supplierId = relationId(listing.resale?.supplierShop);
		if (
			supplierId &&
			(await resolveShopRole(payload, user.id, supplierId, req.context))
		)
			throw new CartError(ERROR_CODES.checkoutSelfPurchase, 403);
		if (relationId(listing.product) !== relationId(variant.product))
			throw new CartError(ERROR_CODES.cartItemUnavailable, 409);

		let cart = await loadActiveCart(payload, user.id, req);

		// Before orderability: a line from another market must name the market
		// rule, not whatever its (foreign) city fails first. An unresolvable
		// market is left to the orderability check, as before.
		const incomingMarket = await marketOfShopOrNull(
			payload,
			await loadShop(payload, shopId, req),
		);
		const keepsLines = !replace && (cart?.items?.length ?? 0) > 0;
		if (cart && keepsLines && incomingMarket) {
			const cartMarket = await marketOfCart(payload, cart, req);
			if (cartMarket && cartMarket.id !== incomingMarket.id) {
				throw new CartError(ERROR_CODES.cartMarketMismatch, 409, undefined, {
					cartMarket: {
						id: cartMarket.id,
						countryCode: cartMarket.countryCode,
					},
				});
			}
		}

		await assertOrderable(payload, listing, variant, settings);
		const unitPrice = cartRetailPrice(listing, variant);
		if (typeof unitPrice !== "number")
			throw new CartError(ERROR_CODES.cartItemUnavailable, 409);

		if (replace && cart && (cart.items?.length ?? 0) > 0) {
			cart = await payload.update({
				collection: "carts",
				id: cart.id,
				overrideAccess: true,
				req,
				data: { items: [], market: null },
			});
		}

		const updated = await applyAddToCart(payload, req, user.id, cart, {
			listing,
			variant,
			shopId,
			quantity,
			unitPrice,
			multiShop: settings.multiShopCartEnabled,
			marketId: incomingMarket?.id ?? null,
		});
		return render(payload, updated, req);
	});
}

export const addCartItem = (
	payload: Payload,
	user: ServiceUser,
	input: AddCartItemInput,
) => addCartItemWith(payload, user, input, toCartView);
export const addCartItemResponse = (
	payload: Payload,
	user: ServiceUser,
	input: AddCartItemInput,
) => addCartItemWith(payload, user, input, toCartResponse);

async function setCartItemQuantityWith<T>(
	payload: Payload,
	user: ServiceUser,
	lineId: unknown,
	quantity: unknown,
	render: Render<T>,
): Promise<T> {
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
		return render(payload, updated, req);
	});
}

async function removeCartItemWith<T>(
	payload: Payload,
	user: ServiceUser,
	lineId: unknown,
	render: Render<T>,
): Promise<T> {
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
			data: {
				items: nextItems,
				...(nextItems.length === 0 ? { market: null } : {}),
				lastActivityAt: new Date().toISOString(),
			},
		});
		return render(payload, updated, req);
	});
}

async function clearCartWith<T>(
	payload: Payload,
	user: ServiceUser,
	render: Render<T>,
): Promise<T> {
	await requireEnabled(payload);

	return withTransaction(payload, async (req) => {
		const cart = await loadActiveCart(payload, user.id, req);
		if (!cart) return render(payload, null, req);

		const updated = await payload.update({
			collection: "carts",
			id: cart.id,
			overrideAccess: true,
			req,
			data: {
				items: [],
				market: null,
				lastActivityAt: new Date().toISOString(),
			},
		});
		return render(payload, updated, req);
	});
}

export const setCartItemQuantity = (
	payload: Payload,
	user: ServiceUser,
	lineId: unknown,
	quantity: unknown,
) => setCartItemQuantityWith(payload, user, lineId, quantity, toCartView);
export const setCartItemQuantityResponse = (
	payload: Payload,
	user: ServiceUser,
	lineId: unknown,
	quantity: unknown,
) => setCartItemQuantityWith(payload, user, lineId, quantity, toCartResponse);
export const removeCartItem = (
	payload: Payload,
	user: ServiceUser,
	lineId: unknown,
) => removeCartItemWith(payload, user, lineId, toCartView);
export const removeCartItemResponse = (
	payload: Payload,
	user: ServiceUser,
	lineId: unknown,
) => removeCartItemWith(payload, user, lineId, toCartResponse);
export const clearCart = (payload: Payload, user: ServiceUser) =>
	clearCartWith(payload, user, toCartView);
export const clearCartResponse = (payload: Payload, user: ServiceUser) =>
	clearCartWith(payload, user, toCartResponse);

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
