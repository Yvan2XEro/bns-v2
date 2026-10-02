import type { Payload } from "payload";
import { resolveSuspension } from "../hooks/suspensionGuard";
import { ERROR_CODES, type ErrorCode } from "../lib/errors";
import {
	isDistrictKey,
	isLaunchCityKey,
	LAUNCH_CITIES,
	type LaunchCityKey,
} from "../lib/launchCities";
import type { CapCheckInput } from "../lib/orderCaps";
import { checkCaps, confirmationPathFor } from "../lib/orderCaps";
import {
	buildContractSnapshot,
	type ContractSnapshot,
	loadSalesTermsTemplate,
} from "../lib/orderContract";
import {
	type BuyerTierKey,
	getOrderSettings,
	isPilotShop,
	type OrderSettings,
} from "../lib/orderSettings";
import { quoteHash } from "../lib/quoteHash";
import {
	type CounterStore,
	getCounterStore,
	hitRateLimit,
	type RateLimitWindow,
} from "../lib/rateLimit";
import { relationId } from "../lib/relationId";
import { ServiceError } from "../lib/serviceError";
import {
	codCaps,
	type ShopCapabilities,
	shopCapabilities,
} from "../lib/shopCapabilities";
import type { Cart, ProductVariant, Shop } from "../payload-types";
import { type CartLineView, loadActiveCart, revalidateCartLines } from "./cart";
import {
	type DeliveryOption,
	type QuoteItem,
	quoteDelivery,
} from "./deliveryQuote";
import { scoreCheckout } from "./orders/risk";
import type { ServiceUser } from "./shops";

export class CheckoutError extends ServiceError {
	constructor(
		code: ErrorCode,
		status: number,
		message?: string,
		details?: Record<string, unknown>,
	) {
		super(code, status, message, details);
		this.name = "CheckoutError";
	}
}

/**
 * Quote and place share this limit (the spec's own words): 10 calls an hour
 * per user, 30 an hour per IP. The IP window exists because quoting is a
 * free look-up for the caller and a way to probe the fee table for anyone
 * else — a per-user limit alone is not enough against a caller who signs up
 * repeatedly.
 */
export const QUOTE_RATE_LIMITS: {
	perUser: readonly RateLimitWindow[];
	perIp: readonly RateLimitWindow[];
} = {
	perUser: [{ name: "checkout-quote:user", limit: 10, windowSeconds: 3600 }],
	perIp: [{ name: "checkout-quote:ip", limit: 30, windowSeconds: 3600 }],
};

const OPEN_ORDER_STATUSES = ["placed", "confirmed", "accepted", "shipped"];

const DOUALA_OFFSET_MS = 60 * 60 * 1000; // Africa/Douala is UTC+1 all year, same as orderMath.ts.

function dayStartDoualaIso(now: Date): string {
	const local = new Date(now.getTime() + DOUALA_OFFSET_MS);
	const midnightLocal = Date.UTC(
		local.getUTCFullYear(),
		local.getUTCMonth(),
		local.getUTCDate(),
	);
	return new Date(midnightLocal - DOUALA_OFFSET_MS).toISOString();
}

async function countBuyerOpenOrders(
	payload: Payload,
	buyerId: string,
): Promise<number> {
	const { totalDocs } = await payload.count({
		collection: "orders",
		where: {
			and: [
				{ buyer: { equals: buyerId } },
				{ status: { in: OPEN_ORDER_STATUSES } },
			],
		},
		overrideAccess: true,
	});
	return totalDocs;
}

async function countShopDailyOrders(
	payload: Payload,
	shopId: string,
	now: Date,
): Promise<number> {
	const { totalDocs } = await payload.count({
		collection: "orders",
		where: {
			and: [
				{ shop: { equals: shopId } },
				{
					"timestamps.placedAt": {
						greater_than_equal: dayStartDoualaIso(now),
					},
				},
			],
		},
		overrideAccess: true,
	});
	return totalDocs;
}

/**
 * The eight checks shared with Task 19's `placeOrder`: this is the single
 * implementation, called by the quote and re-run, unchanged, at placement —
 * a client cannot skip a check by going straight to `/place`.
 */
export interface CheckoutContext {
	settings: OrderSettings;
	cart: Cart;
	lines: CartLineView[];
	shop: Shop;
	capabilities: ShopCapabilities;
}

export async function assertCheckoutPreconditions(
	payload: Payload,
	user: ServiceUser,
	options: { now?: Date } = {},
): Promise<CheckoutContext> {
	const now = options.now ?? new Date();

	// 1. The feature flag.
	const settings = await getOrderSettings(payload);
	if (!settings.enabled) {
		throw new CheckoutError(ERROR_CODES.checkoutDisabled, 403);
	}

	// 2. The buyer's own phone must be verified.
	const account = await payload.findByID({
		collection: "users",
		id: user.id,
		depth: 0,
		overrideAccess: true,
	});
	if (!account.phone || !account.phoneVerifiedAt) {
		throw new CheckoutError(ERROR_CODES.checkoutPhoneNotVerified, 403);
	}

	// 3. Not suspended.
	if (await resolveSuspension(payload, user.id, account)) {
		throw new CheckoutError(ERROR_CODES.accountSuspended, 403);
	}

	// 4. Cart non-empty.
	const cart = await loadActiveCart(payload, user.id);
	if (!cart || (cart.items?.length ?? 0) === 0) {
		throw new CheckoutError(ERROR_CODES.cartEmpty, 400);
	}

	// 5. The shop must be active and not restricted. Resolved from the raw
	// cart item (not `revalidateCartLines`'s output) and checked before the
	// line-level pass below: `revalidateCartLines` itself treats a shop gone
	// inactive as "the line is unavailable" (`cart.itemUnavailable`), which is
	// the right read for the cart screen but would shadow the more specific
	// `order.shopUnavailable`/`order.codUnavailable` this precondition owes a
	// checkout caller.
	const shopId = relationId(cart.items?.[0]?.shop);
	if (!shopId) throw new CheckoutError(ERROR_CODES.cartEmpty, 400);
	const shop = await payload
		.findByID({
			collection: "shops",
			id: shopId,
			depth: 0,
			overrideAccess: true,
		})
		.catch(() => null);
	if (!shop || shop.status !== "active" || shop.ordersRestrictedAt) {
		throw new CheckoutError(ERROR_CODES.orderShopUnavailable, 409);
	}

	// 6. The shop must have COD enabled and a level that grants it.
	const capabilities = shopCapabilities(shop, now);
	if (shop.orderSettings?.codEnabled !== true || !capabilities.codOrders) {
		throw new CheckoutError(ERROR_CODES.orderCodUnavailable, 409);
	}

	// 7. The shop must be a pilot shop, when the pilot list is non-empty.
	if (!isPilotShop(settings, shopId)) {
		throw new CheckoutError(ERROR_CODES.orderCodUnavailable, 409);
	}

	// 8. Every line still available, at the requested quantity.
	const lines = await revalidateCartLines(payload, cart);
	const badLine = lines.find((line) => line.unavailable);
	if (badLine) {
		throw new CheckoutError(
			badLine.unavailableCode ?? ERROR_CODES.cartItemUnavailable,
			409,
			undefined,
			{ line: badLine },
		);
	}

	return { settings, cart, lines, shop, capabilities };
}

export interface CheckoutAddressInput {
	recipientName?: unknown;
	phone?: unknown;
	city?: unknown;
	district?: unknown;
	districtOther?: unknown;
	landmark?: unknown;
	instructions?: unknown;
	gps?: unknown;
}

export interface CheckoutQuoteInput {
	address: CheckoutAddressInput;
	deliveryOptionId?: unknown;
	paymentMethod?: unknown;
	locale?: unknown;
}

export interface DeliveryAddress {
	recipientName: string;
	phone: string;
	city: LaunchCityKey;
	district: string;
	districtOther: string | null;
	landmark: string | null;
	instructions: string | null;
	gps: { lat: number; lng: number; accuracyMeters: number | null } | null;
}

const CAMEROON_PHONE = /^\+237\d{9}$/;

function normalizeAddressPhone(raw: string): string {
	const trimmed = raw.trim().replace(/[\s-]/g, "");
	if (trimmed.startsWith("00")) return `+${trimmed.slice(2)}`;
	if (trimmed.startsWith("+")) return trimmed;
	return `+${trimmed}`;
}

function numberField(
	record: Record<string, unknown>,
	key: string,
): number | null {
	const value = record[key];
	return typeof value === "number" ? value : null;
}

function gpsOf(value: unknown): DeliveryAddress["gps"] {
	if (!value || typeof value !== "object" || Array.isArray(value)) return null;
	const record = value as Record<string, unknown>;
	const lat = numberField(record, "lat");
	const lng = numberField(record, "lng");
	if (lat === null || lng === null) return null;
	return { lat, lng, accuracyMeters: numberField(record, "accuracyMeters") };
}

function addressInvalid(field: string): never {
	throw new CheckoutError(ERROR_CODES.checkoutAddressInvalid, 400, undefined, {
		field,
	});
}

/**
 * Every field the Orders collection's `delivery` group stores, checked
 * against the same bounds that collection declares — `checkout.addressInvalid`
 * names the field path so a client can highlight it.
 */
export function parseDeliveryAddress(
	raw: CheckoutAddressInput,
	method: "seller_delivery" | "pickup",
): DeliveryAddress {
	const recipientName =
		typeof raw.recipientName === "string" ? raw.recipientName.trim() : "";
	if (recipientName.length < 2 || recipientName.length > 60) {
		addressInvalid("delivery.recipientName");
	}

	const phone =
		typeof raw.phone === "string" ? normalizeAddressPhone(raw.phone) : "";
	if (!CAMEROON_PHONE.test(phone)) addressInvalid("delivery.phone");

	const cityRaw = typeof raw.city === "string" ? raw.city : "";
	if (!isLaunchCityKey(cityRaw)) addressInvalid("delivery.city");
	const city = cityRaw;

	const district = typeof raw.district === "string" ? raw.district : "";
	if (!district || !isDistrictKey(city, district)) {
		addressInvalid("delivery.district");
	}

	const districtOtherRaw =
		typeof raw.districtOther === "string" ? raw.districtOther.trim() : "";
	if (district === `${city}.other`) {
		if (districtOtherRaw.length < 2 || districtOtherRaw.length > 60) {
			addressInvalid("delivery.districtOther");
		}
	}

	const landmarkRaw =
		typeof raw.landmark === "string" ? raw.landmark.trim() : "";
	if (method === "seller_delivery") {
		if (landmarkRaw.length < 5 || landmarkRaw.length > 200) {
			addressInvalid("delivery.landmark");
		}
	} else if (
		landmarkRaw &&
		(landmarkRaw.length < 5 || landmarkRaw.length > 200)
	) {
		addressInvalid("delivery.landmark");
	}

	const instructionsRaw =
		typeof raw.instructions === "string" ? raw.instructions : "";
	if (instructionsRaw.length > 300) addressInvalid("delivery.instructions");

	const gps = gpsOf(raw.gps);

	return {
		recipientName,
		phone,
		city,
		district,
		districtOther: district === `${city}.other` ? districtOtherRaw : null,
		landmark: landmarkRaw || null,
		instructions: instructionsRaw || null,
		gps,
	};
}

export interface QuoteSummaryItem {
	lineId: string;
	listingId: string;
	variantId: string;
	title: string;
	variantLabel: string;
	condition: string | null;
	imageUrl: string | null;
	unitPrice: number;
	quantity: number;
	lineSubtotal: number;
}

export interface QuoteResponse {
	summary: {
		shopId: string;
		items: QuoteSummaryItem[];
		subtotal: number;
		deliveryFee: number;
		total: number;
		paymentMethod: "cod";
		delivery: {
			optionId: string;
			method: "seller_delivery" | "pickup";
			etaText: string;
			address: DeliveryAddress;
		};
	};
	preContract: ContractSnapshot;
	confirmationRequired: "none" | "sms_code" | "seller_call";
	quoteHash: string;
}

function mediaUrlOf(value: unknown): string | null {
	if (value && typeof value === "object" && "url" in value) {
		const url = (value as { url?: unknown }).url;
		return typeof url === "string" ? url : null;
	}
	return null;
}

function variantLabelOf(variant: ProductVariant | null): string {
	const values = variant?.optionValues;
	if (!values || typeof values !== "object" || Array.isArray(values)) return "";
	return Object.entries(values as Record<string, unknown>)
		.map(([key, value]) => `${key}: ${String(value)}`)
		.join(", ");
}

async function buildSummaryItems(
	payload: Payload,
	lines: readonly CartLineView[],
): Promise<QuoteSummaryItem[]> {
	return Promise.all(
		lines.map(async (line) => {
			const [listing, variant] = await Promise.all([
				line.listingId
					? payload
							.findByID({
								collection: "listings",
								id: line.listingId,
								depth: 1,
								overrideAccess: true,
							})
							.catch(() => null)
					: null,
				line.variantId
					? payload
							.findByID({
								collection: "product-variants",
								id: line.variantId,
								depth: 0,
								overrideAccess: true,
							})
							.catch(() => null)
					: null,
			]);
			const unitPrice = line.currentPrice ?? line.priceAtAdd;
			const firstImage = listing?.images?.[0]?.image;
			return {
				lineId: line.id,
				listingId: line.listingId,
				variantId: line.variantId,
				title: listing?.title ?? line.title,
				variantLabel: variantLabelOf(variant),
				condition: listing?.condition ?? null,
				imageUrl: mediaUrlOf(firstImage),
				unitPrice,
				quantity: line.quantity,
				lineSubtotal: unitPrice * line.quantity,
			};
		}),
	);
}

interface CompanySettings {
	legalName: string;
	supportEmail: string | null;
	supportPhone: string | null;
}

async function loadCompanySettings(payload: Payload): Promise<CompanySettings> {
	try {
		const global = await payload.findGlobal({
			slug: "app-settings",
			depth: 0,
			overrideAccess: true,
		});
		const company = global.company;
		return {
			legalName:
				typeof company?.legalName === "string" && company.legalName
					? company.legalName
					: "BuyNSellem",
			supportEmail:
				typeof company?.supportEmail === "string" ? company.supportEmail : null,
			supportPhone:
				typeof company?.supportPhone === "string" ? company.supportPhone : null,
		};
	} catch {
		return { legalName: "BuyNSellem", supportEmail: null, supportPhone: null };
	}
}

async function codAllowedByProduct(
	payload: Payload,
	lines: readonly CartLineView[],
): Promise<Map<string, boolean>> {
	const productIds = [
		...new Set(lines.map((line) => line.productId).filter(Boolean)),
	];
	const products = await Promise.all(
		productIds.map((id) =>
			payload
				.findByID({
					collection: "products",
					id,
					depth: 0,
					overrideAccess: true,
				})
				.catch(() => null),
		),
	);
	const map = new Map<string, boolean>();
	for (const product of products) {
		if (!product) continue;
		map.set(product.id, product.delivery?.codAllowed !== false);
	}
	return map;
}

/**
 * The buyer's own COD checkout quote: a priced promise computed fresh from
 * the current cart, the shop's current settings and the buyer's current
 * risk tier — never from anything stored. `placeOrder` (Task 19) re-runs
 * every check here and recomputes `quoteHash` rather than trusting what the
 * client hands back; a changed input (a price, a fee, the method, the city,
 * the terms version) must change the hash so a mismatch is detectable.
 *
 * Nothing here writes: a quote is never stored.
 */
export async function quoteCheckout(
	payload: Payload,
	user: ServiceUser,
	input: CheckoutQuoteInput,
	options: { store?: CounterStore; now?: Date; ip?: string } = {},
): Promise<QuoteResponse> {
	const now = options.now ?? new Date();
	const store = options.store ?? getCounterStore();

	// Counted before any lookup: the limit protects the fee table as much as
	// it protects the server, so a refused call must be counted too.
	const [userLimited, ipLimited] = await Promise.all([
		hitRateLimit(
			store,
			`user:${user.id}`,
			QUOTE_RATE_LIMITS.perUser,
			now.getTime(),
		),
		hitRateLimit(
			store,
			`ip:${options.ip ?? "unknown"}`,
			QUOTE_RATE_LIMITS.perIp,
			now.getTime(),
		),
	]);
	if (userLimited || ipLimited) {
		throw new CheckoutError(ERROR_CODES.rateLimited, 429);
	}

	const ctx = await assertCheckoutPreconditions(payload, user, { now });
	const { settings, lines, shop, capabilities } = ctx;

	if (input.paymentMethod !== "cod") {
		// P5's `mobile_money` is behind its own flag; until it ships this is
		// the honest answer for any other payment method.
		throw new CheckoutError(ERROR_CODES.checkoutMethodUnavailable, 409);
	}

	const optionId =
		typeof input.deliveryOptionId === "string" ? input.deliveryOptionId : "";
	const method: "seller_delivery" | "pickup" = optionId.startsWith("pickup:")
		? "pickup"
		: "seller_delivery";

	const address = parseDeliveryAddress(input.address, method);

	if ((shop.location?.city ?? null) !== address.city) {
		throw new CheckoutError(ERROR_CODES.checkoutCityNotServed, 409);
	}

	const codAllowedMap = await codAllowedByProduct(payload, lines);
	const subtotal = lines.reduce(
		(sum, line) => sum + (line.currentPrice ?? line.priceAtAdd) * line.quantity,
		0,
	);
	const quoteItems: QuoteItem[] = lines.map((line) => ({
		variantId: line.variantId,
		quantity: line.quantity,
		lineSubtotal: (line.currentPrice ?? line.priceAtAdd) * line.quantity,
		codAllowed: codAllowedMap.get(line.productId) ?? true,
	}));

	const deliveryOptions: DeliveryOption[] = await quoteDelivery({
		shop,
		items: quoteItems,
		subtotal,
		destination: { city: address.city, district: address.district },
		settings,
	});
	const chosen = deliveryOptions.find((option) => option.optionId === optionId);
	if (!chosen) {
		throw new CheckoutError(ERROR_CODES.checkoutMethodUnavailable, 409);
	}
	if (!chosen.codAllowed) {
		throw new CheckoutError(ERROR_CODES.orderCodUnavailable, 409);
	}

	const account = await payload.findByID({
		collection: "users",
		id: user.id,
		depth: 0,
		overrideAccess: true,
	});
	const { tier } = await scoreCheckout(
		payload,
		{ accountPhone: account.phone ?? null, deliveryPhone: address.phone },
		now,
	);
	if (tier === "blocked") {
		throw new CheckoutError(ERROR_CODES.orderCodUnavailable, 409);
	}

	const total = subtotal + chosen.fee;
	const shopCaps = codCaps(capabilities.effectiveLevel, settings.shopCaps);
	if (!shopCaps) {
		throw new CheckoutError(ERROR_CODES.orderCodUnavailable, 409);
	}
	const buyerCapRow = settings.buyerCaps[tier as BuyerTierKey];

	const [openOrders, dailyOrders] = await Promise.all([
		countBuyerOpenOrders(payload, user.id),
		countShopDailyOrders(payload, String(shop.id), now),
	]);
	const capInput: CapCheckInput = {
		orderTotal: total,
		openOrders,
		dailyOrders,
		shop: shopCaps,
		buyer: buyerCapRow,
	};
	const breach = checkCaps(capInput);
	if (breach) {
		throw new CheckoutError(
			breach.scope === "buyer"
				? ERROR_CODES.orderBuyerCapReached
				: ERROR_CODES.orderShopCapReached,
			409,
		);
	}

	const deliveryPhoneIsVerifiedAccountPhone = Boolean(
		account.phoneVerifiedAt && account.phone && account.phone === address.phone,
	);
	const confirmationRequired = confirmationPathFor({
		tier,
		deliveryPhoneIsVerifiedAccountPhone,
	});

	const locale = input.locale === "en" ? "en" : "fr";
	const [company, termsFr, termsEn, items] = await Promise.all([
		loadCompanySettings(payload),
		loadSalesTermsTemplate(settings.termsVersion, "fr"),
		loadSalesTermsTemplate(settings.termsVersion, "en"),
		buildSummaryItems(payload, lines),
	]);

	const preContract = buildContractSnapshot({
		termsVersion: settings.termsVersion,
		locale,
		seller: {
			name: shop.name,
			handle: shop.handle,
			city: shop.location?.city ?? null,
			phone: shop.contact?.phone ?? null,
		},
		platform: {
			legalName: company.legalName,
			supportEmail: company.supportEmail,
			supportPhone: company.supportPhone,
		},
		items: items.map((item) => ({
			title: item.title,
			variantLabel: item.variantLabel,
			condition: item.condition,
			imageUrl: item.imageUrl,
			attributes: [],
			unitPrice: item.unitPrice,
			quantity: item.quantity,
			lineSubtotal: item.lineSubtotal,
		})),
		amounts: { subtotal, deliveryFee: chosen.fee, total },
		delivery: {
			areaText: {
				fr: LAUNCH_CITIES[address.city].label,
				en: LAUNCH_CITIES[address.city].label,
			},
			etaText: { fr: chosen.etaText, en: chosen.etaText },
		},
		acceptHours: settings.acceptHours,
		withdrawalDays: settings.withdrawalDays,
		salesTermsTemplate: { fr: termsFr, en: termsEn },
		salesTermsExtra: shop.orderSettings?.salesTermsExtra ?? null,
	});

	const hash = quoteHash({
		lines: lines.map((line) => ({
			lineId: line.id,
			variantId: line.variantId,
			quantity: line.quantity,
			unitPrice: line.currentPrice ?? line.priceAtAdd,
		})),
		deliveryFee: chosen.fee,
		method: chosen.method,
		city: address.city,
		paymentMethod: "cod",
		termsVersion: settings.termsVersion,
	});

	return {
		summary: {
			shopId: String(shop.id),
			items,
			subtotal,
			deliveryFee: chosen.fee,
			total,
			paymentMethod: "cod",
			delivery: {
				optionId: chosen.optionId,
				method: chosen.method,
				etaText: chosen.etaText,
				address,
			},
		},
		preContract,
		confirmationRequired,
		quoteHash: hash,
	};
}
