import type { Payload } from "payload";
import type {
	SplitPlaceResponse,
	SplitQuoteGroup,
	SplitQuoteView,
} from "../contracts/checkoutGroup";
import { queueSearchEvent } from "../hooks/searchEvents";
import { ERROR_CODES } from "../lib/errors";
import { sha256 } from "../lib/hash";
import { liveMarketOfShop } from "../lib/markets";
import { checkCaps } from "../lib/orderCaps";
import { vatOf } from "../lib/orderMath";
import type { OrderSettings } from "../lib/orderSettings";
import type { CounterStore } from "../lib/rateLimit";
import { ServiceError } from "../lib/serviceError";
import { withTransaction } from "../lib/transactions";
import { availableOf } from "../lib/variants";
import type { Order, Shop } from "../payload-types";
import {
	type CartLineState,
	type CartShopView,
	groupKeyOf,
	loadActiveCart,
	markCartConverted,
	revalidateCartLines,
	summaryOf,
} from "./cart";
import {
	assertBuyerCanCheckout,
	assertShopCanSell,
	CheckoutError,
	type CheckoutPlaceInput,
	type CheckoutQuoteInput,
	countQuoteAttempt,
	createOrderRows,
	findOrderByIdempotencyKey,
	finishPlacedOrder,
	type LinesQuote,
	type OrderDraft,
	type QuoteSummaryItem,
	type QuoteSummaryLine,
	quoteLines,
} from "./checkout";
import { recordPlacement, scoreCheckout } from "./orders/risk";
import { nextNumber } from "./sequences";
import { isUniqueViolation, type ServiceUser } from "./shops";
import { reserve } from "./stock";

export type { SplitPlaceResponse, SplitQuoteGroup, SplitQuoteView };

export interface QuoteGroup {
	groupKey: string;
	storefrontId: string;
	lines: CartLineState[];
}

export function groupLines(lines: readonly CartLineState[]): QuoteGroup[] {
	const groups = new Map<string, QuoteGroup>();
	for (const line of lines) {
		const groupKey = groupKeyOf(line.shopId, line.fulfillingShopId);
		const group = groups.get(groupKey);
		if (group) group.lines.push(line);
		else
			groups.set(groupKey, {
				groupKey,
				storefrontId: line.shopId,
				lines: [line],
			});
	}
	return [...groups.values()];
}

// A bad address or a corrupted group is the request's fault, not one group's.
const FATAL = new Set<string>([
	ERROR_CODES.checkoutAddressInvalid,
	ERROR_CODES.cartSingleFulfilment,
]);

function pickedOption(input: CheckoutQuoteInput, groupKey: string): string {
	const picks = input.deliveryByGroup;
	if (!picks || typeof picks !== "object") return "";
	const value = (picks as Record<string, unknown>)[groupKey];
	return typeof value === "string" ? value : "";
}

/** One group through the single-shop quote path; the fulfilling shop is resolved there, from the lines. */
export async function quoteGroup(
	payload: Payload,
	user: ServiceUser,
	input: CheckoutQuoteInput,
	ctx: Parameters<typeof quoteLines>[3],
	group: Pick<QuoteGroup, "groupKey">,
	now: Date,
): Promise<LinesQuote> {
	return quoteLines(
		payload,
		user,
		{ ...input, deliveryOptionId: pickedOption(input, group.groupKey) },
		ctx,
		now,
		{ groupKey: group.groupKey },
	);
}

/**
 * One quote per (storefront, fulfilling) group, each through the existing
 * single-shop path. A group that cannot sell or serve the address is listed
 * under `unavailableGroups` and left out of the total, so the buyer can place
 * the rest. The top-level hash folds in every group's hash and the set of
 * unavailable keys, so an edit to any group, or one coming back, moves it.
 */
export async function quoteSplit(
	payload: Payload,
	user: ServiceUser,
	input: CheckoutQuoteInput,
	options: { store?: CounterStore; now?: Date; ip?: string } = {},
): Promise<SplitQuoteView> {
	return (await planSplit(payload, user, input, options)).view;
}

/** A quoted group with what placing it needs and the wire view does not carry. */
export interface GroupPlan {
	groupKey: string;
	storefrontId: string;
	fulfillingShopId: string;
	shop: Shop;
	quoted: LinesQuote;
	view: SplitQuoteGroup;
}

export interface SplitPlan {
	view: SplitQuoteView;
	groups: GroupPlan[];
	settings: OrderSettings;
	/** Every line of the cart behind the quote, placed or not. */
	lineCount: number;
}

export async function planSplit(
	payload: Payload,
	user: ServiceUser,
	input: CheckoutQuoteInput,
	options: { store?: CounterStore; now?: Date; ip?: string } = {},
): Promise<SplitPlan> {
	const now = options.now ?? new Date();
	await countQuoteAttempt(user, options);
	const { settings, cart } = await assertBuyerCanCheckout(payload, user);
	const lines = await revalidateCartLines(payload, cart);

	const shops = new Map<string, Shop | null>();
	const shopOf = async (id: string) => {
		if (!shops.has(id))
			shops.set(
				id,
				await payload
					.findByID({
						collection: "shops",
						id,
						depth: 0,
						overrideAccess: true,
					})
					.catch(() => null),
			);
		return shops.get(id) ?? null;
	};

	const groups: SplitQuoteGroup[] = [];
	const plans: GroupPlan[] = [];
	const unavailableGroups: SplitQuoteView["unavailableGroups"] = [];
	let marketOf: { countryCode: string; currency: string } | null = null;

	for (const group of groupLines(lines)) {
		try {
			const { shop, capabilities } = await assertShopCanSell(
				payload,
				group.storefrontId,
				settings,
				now,
			);
			const bad = group.lines.find((line) => !line.available);
			if (bad) {
				throw new CheckoutError(
					bad.unavailableCode ?? ERROR_CODES.cartItemUnavailable,
					409,
				);
			}
			const quoted = await quoteGroup(
				payload,
				user,
				input,
				{ settings, lines: group.lines, shop, capabilities },
				group,
				now,
			);
			const { amounts, delivery } = quoted.response.summary;
			const fulfillingId = group.lines[0].fulfillingShopId;
			const fulfilling = await shopOf(fulfillingId);
			marketOf ??= {
				countryCode: quoted.internals.market.countryCode,
				currency: amounts.currency,
			};
			const groupView: SplitQuoteGroup = {
				groupKey: group.groupKey,
				storefrontShop: summaryOf(shop, String(shop.id)),
				fulfillingShop: summaryOf(fulfilling, fulfillingId),
				resale: fulfillingId !== group.storefrontId,
				items: quoted.response.summary.lines,
				subtotal: amounts.subtotal,
				delivery: {
					options: quoted.delivery.options,
					unavailable: quoted.delivery.unavailable.map(
						(entry) => `${entry.method}:${entry.reason}`,
					),
				},
				selectedOptionId: delivery.optionId,
				deliveryFee: amounts.deliveryFee,
				vat: vatOf(quoted.commission, quoted.vatRateBps),
				total: amounts.total,
				quoteHash: quoted.response.quoteHash,
			};
			groups.push(groupView);
			plans.push({
				groupKey: group.groupKey,
				storefrontId: group.storefrontId,
				fulfillingShopId: fulfillingId,
				shop,
				quoted,
				view: groupView,
			});
		} catch (error) {
			if (!(error instanceof CheckoutError) || FATAL.has(error.code))
				throw error;
			unavailableGroups.push({ groupKey: group.groupKey, reason: error.code });
		}
	}

	if (!marketOf) {
		const first = await shopOf(lines[0].shopId);
		if (!first) throw new CheckoutError(ERROR_CODES.orderShopUnavailable, 409);
		const market = await liveMarketOfShop(payload, first);
		marketOf = {
			countryCode: market.countryCode,
			currency: market.currency.code,
		};
	}

	return {
		settings,
		lineCount: lines.length,
		groups: plans,
		view: {
			market: marketOf,
			groups,
			unavailableGroups,
			grandTotal: groups.reduce((sum, group) => sum + group.total, 0),
			quoteHash: sha256(
				JSON.stringify({
					groups: groups.map((g) => [g.groupKey, g.quoteHash]),
					unavailable: unavailableGroups.map((g) => [g.groupKey, g.reason]),
				}),
			),
		},
	};
}

type PlaceOptions = {
	now?: Date;
	store?: CounterStore;
	ip?: string;
	source?: "web" | "ios" | "android";
};

function responseOf(
	checkoutGroup: string,
	orders: Order[],
	shops: Map<string, CartShopView>,
): SplitPlaceResponse {
	return {
		checkoutGroup,
		orders: [...orders]
			.sort((a, b) => (a.orderNumber < b.orderNumber ? -1 : 1))
			.map((order) => {
				const shopId =
					typeof order.shop === "string" ? order.shop : order.shop.id;
				const shop = shops.get(String(shopId));
				if (!shop || !order.amounts?.currency) {
					throw new ServiceError(ERROR_CODES.server, 500);
				}
				return {
					id: String(order.id),
					orderNumber: order.orderNumber,
					shop,
					total: order.amounts.total ?? 0,
					currency: order.amounts.currency,
					paymentMethod:
						order.paymentMethod === "mobile_money" ? "mobile_money" : "cod",
				};
			}),
	};
}

async function replayOf(
	payload: Payload,
	order: Order,
): Promise<SplitPlaceResponse> {
	const checkoutGroup = order.checkoutGroup;
	if (!checkoutGroup) throw new ServiceError(ERROR_CODES.server, 500);
	const { docs } = await payload.find({
		collection: "orders",
		where: { checkoutGroup: { equals: checkoutGroup } },
		limit: 0,
		pagination: false,
		depth: 0,
		overrideAccess: true,
	});
	const shops = new Map<string, CartShopView>();
	for (const row of docs) {
		const id = String(typeof row.shop === "string" ? row.shop : row.shop.id);
		if (shops.has(id)) continue;
		const shop = await payload.findByID({
			collection: "shops",
			id,
			depth: 0,
			overrideAccess: true,
		});
		shops.set(id, summaryOf(shop, id));
	}
	return responseOf(checkoutGroup, docs, shops);
}

/**
 * Every group a placement may place, or the refusal: a group listed as
 * unavailable, or one the quote never had, is `checkout.groupUnavailable`.
 * Without `groupKeys` the buyer places the rest.
 */
function selectGroups(plan: SplitPlan, input: CheckoutPlaceInput): GroupPlan[] {
	const wanted = Array.isArray(input.groupKeys)
		? input.groupKeys.filter((key): key is string => typeof key === "string")
		: null;
	const chosen = wanted
		? wanted.map((key) => ({
				key,
				plan: plan.groups.find((group) => group.groupKey === key),
			}))
		: plan.groups.map((group) => ({ key: group.groupKey, plan: group }));
	const missing = chosen.find((entry) => !entry.plan);
	const refused = missing
		? {
				groupKey: missing.key,
				reason:
					plan.view.unavailableGroups.find((g) => g.groupKey === missing.key)
						?.reason ?? null,
			}
		: chosen.length === 0
			? (plan.view.unavailableGroups[0] ?? { groupKey: null, reason: null })
			: null;
	if (refused) {
		throw new CheckoutError(
			ERROR_CODES.checkoutGroupUnavailable,
			409,
			undefined,
			refused,
		);
	}
	return chosen.flatMap((entry) => (entry.plan ? [entry.plan] : []));
}

/**
 * The quote's per-order invariant, re-asserted where the orders are written:
 * every item of a group is fulfilled by the one shop the group is keyed on.
 */
function assertOneFulfilment(group: GroupPlan): void {
	const { internals } = group.quoted;
	const fulfilling = new Set(
		internals.items.map(
			(item) => item.resale?.supplierShop ?? internals.shopId,
		),
	);
	if (fulfilling.size !== 1 || !fulfilling.has(group.fulfillingShopId)) {
		throw new CheckoutError(ERROR_CODES.orderMixedFulfilment, 500);
	}
}

/**
 * The caps each group was quoted against knew nothing of its siblings. Placed
 * together they count: the n-th order sees n earlier open orders of the buyer,
 * and every earlier order to the same storefront in the shop's day.
 */
function assertSplitCaps(groups: GroupPlan[]): void {
	groups.forEach((group, index) => {
		const earlier = groups.slice(0, index);
		const breach = checkCaps({
			...group.quoted.capInput,
			openOrders: group.quoted.capInput.openOrders + index,
			dailyOrders:
				group.quoted.capInput.dailyOrders +
				earlier.filter((other) => other.storefrontId === group.storefrontId)
					.length,
		});
		if (breach) {
			throw new CheckoutError(
				breach.scope === "buyer"
					? ERROR_CODES.orderBuyerCapReached
					: ERROR_CODES.orderShopCapReached,
				409,
			);
		}
	});
}

/** Places a quoted split: all of its orders, or none. */
export async function placeGroups(
	payload: Payload,
	user: ServiceUser,
	plan: SplitPlan,
	groups: GroupPlan[],
	input: { idempotencyKey: string; paymentMethod: "cod" | "mobile_money" },
	options: PlaceOptions = {},
): Promise<SplitPlaceResponse> {
	const now = options.now ?? new Date();
	const source = options.source ?? "web";
	const { settings } = plan;
	const first = groups[0].quoted.internals;

	const account = await payload.findByID({
		collection: "users",
		id: user.id,
		depth: 0,
		overrideAccess: true,
	});
	const { tier, refusals } = await scoreCheckout(
		payload,
		{
			accountPhone: account.phone ?? null,
			deliveryPhone: first.address.phone,
		},
		now,
	);
	assertSplitCaps(groups);

	// Outside the transaction (the sequences rule); a failed placement burns them.
	const checkoutGroup = await nextNumber(payload, "CHK", now, first.market);
	const numbers: string[] = [];
	for (const _ of groups) {
		numbers.push(await nextNumber(payload, "BNS", now, first.market));
	}

	const placedAtIso = now.toISOString();
	const confirmBy = new Date(
		now.getTime() + settings.confirmHours * 60 * 60 * 1000,
	).toISOString();
	const acceptBy = new Date(
		now.getTime() + settings.acceptHours * 60 * 60 * 1000,
	).toISOString();

	const draftOf = (group: GroupPlan, index: number): OrderDraft => ({
		user,
		source,
		settings,
		orderNumber: numbers[index],
		// The first order owns the caller's key, so a replay finds the group through it.
		idempotencyKey:
			index === 0 ? input.idempotencyKey : `${input.idempotencyKey}#${index}`,
		checkoutGroup,
		paymentMethod: input.paymentMethod,
		fresh: group.quoted.response,
		internals: group.quoted.internals,
		tier,
		refusals,
		placedAtIso,
		confirmBy,
		acceptBy,
	});

	const shops = new Map<string, CartShopView>(
		groups.map((group) => [group.storefrontId, group.view.storefrontShop]),
	);

	try {
		const placed = await withTransaction(
			payload,
			async (req) => {
				const cart = await loadActiveCart(req.payload, user.id);
				if (!cart) throw new CheckoutError(ERROR_CODES.cartEmpty, 400);

				const created: Order[] = [];
				const reservations: Array<{
					order: Order;
					line: QuoteSummaryItem;
					variantId: string;
				}> = [];
				for (const [index, group] of groups.entries()) {
					assertOneFulfilment(group);
					created.push(
						await createOrderRows(
							req,
							draftOf(group, index),
							async (order, line, variant) => {
								if (variant.trackInventory === true) {
									reservations.push({
										order,
										line,
										variantId: String(variant.id),
									});
								}
							},
						),
					);
				}

				// One global order over every group's variants, so two placements
				// that share variants lock them in the same sequence.
				const zeroedListingIds = new Set<string>();
				const sorted = [...reservations].sort((a, b) =>
					a.variantId < b.variantId ? -1 : a.variantId > b.variantId ? 1 : 0,
				);
				for (const { order, line, variantId } of sorted) {
					const variant = await req.payload.findByID({
						collection: "product-variants",
						id: variantId,
						depth: 0,
						overrideAccess: true,
						req,
					});
					try {
						const reservation = await reserve(req, {
							variant,
							quantity: line.quantity,
							orderId: String(order.id),
							orderRef: order.orderNumber,
						});
						if (
							reservation &&
							line.listingId &&
							availableOf(reservation.variant) === 0
						) {
							zeroedListingIds.add(line.listingId);
						}
					} catch (error) {
						if (
							error instanceof ServiceError &&
							error.code === ERROR_CODES.stockInsufficient
						) {
							throw new CheckoutError(
								ERROR_CODES.checkoutStockChanged,
								409,
								undefined,
								{ variant: variantId },
							);
						}
						throw error;
					}
				}

				const finished: Order[] = [];
				for (const [index, order] of created.entries()) {
					await recordPlacement(req, {
						phone: first.address.phone,
						orderId: String(order.id),
					});
					finished.push(
						await finishPlacedOrder(req, order, draftOf(groups[index], index)),
					);
				}

				const placedLineIds = new Set(
					groups.flatMap((group) =>
						group.quoted.internals.items.map((item) => item.lineId),
					),
				);
				const rest = (cart.items ?? []).filter(
					(item) => !placedLineIds.has(String(item.id)),
				);
				if (rest.length === 0) {
					await markCartConverted(
						req,
						String(cart.id),
						created.map((order) => String(order.id)),
					);
				} else {
					await req.payload.update({
						collection: "carts",
						id: cart.id,
						overrideAccess: true,
						req,
						data: { items: rest },
					});
				}

				for (const listingId of zeroedListingIds) {
					await queueSearchEvent(req, "listing.updated", listingId);
				}
				return finished;
			},
			{ user },
		);
		return responseOf(checkoutGroup, placed, shops);
	} catch (error) {
		if (isUniqueViolation(error)) {
			const recovered = await findOrderByIdempotencyKey(
				payload,
				user.id,
				input.idempotencyKey,
			);
			if (recovered?.checkoutGroup) return replayOf(payload, recovered);
		}
		throw error;
	}
}

/** `POST /api/checkout/place` behind `multiShopCartEnabled`. */
export async function placeSplit(
	payload: Payload,
	user: ServiceUser,
	input: CheckoutPlaceInput,
	options: PlaceOptions = {},
): Promise<SplitPlaceResponse> {
	const now = options.now ?? new Date();
	const idempotencyKey =
		typeof input.idempotencyKey === "string" ? input.idempotencyKey.trim() : "";
	if (!idempotencyKey) {
		throw new CheckoutError(ERROR_CODES.validation, 400, undefined, {
			field: "idempotencyKey",
		});
	}
	const already = await findOrderByIdempotencyKey(
		payload,
		user.id,
		idempotencyKey,
	);
	if (already?.checkoutGroup) return replayOf(payload, already);

	const plan = await planSplit(payload, user, input, { ...options, now });
	const suppliedHash =
		typeof input.quoteHash === "string" ? input.quoteHash : "";
	if (suppliedHash !== plan.view.quoteHash) {
		throw new CheckoutError(ERROR_CODES.checkoutQuoteChanged, 409, undefined, {
			quote: plan.view,
		});
	}
	if (input.termsAccepted !== true) {
		throw new CheckoutError(ERROR_CODES.checkoutTermsNotAccepted, 400);
	}
	const groups = selectGroups(plan, input);
	const paymentMethod =
		input.paymentMethod === "mobile_money" ? "mobile_money" : "cod";
	return placeGroups(
		payload,
		user,
		plan,
		groups,
		{ idempotencyKey, paymentMethod },
		{ ...options, now },
	);
}
