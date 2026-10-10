import type { Payload } from "payload";
import { ERROR_CODES } from "../lib/errors";
import { sha256 } from "../lib/hash";
import { liveMarketOfShop } from "../lib/markets";
import { vatOf } from "../lib/orderMath";
import type { CounterStore } from "../lib/rateLimit";
import type { Shop } from "../payload-types";
import {
	type CartLineState,
	type CartShopView,
	groupKeyOf,
	revalidateCartLines,
	summaryOf,
} from "./cart";
import {
	assertBuyerCanCheckout,
	assertShopCanSell,
	CheckoutError,
	type CheckoutQuoteInput,
	countQuoteAttempt,
	type LinesQuote,
	type QuoteSummaryLine,
	quoteLines,
} from "./checkout";
import type { DeliveryOption } from "./deliveryQuote";
import type { ServiceUser } from "./shops";

export interface SplitQuoteGroup {
	groupKey: string;
	storefrontShop: CartShopView;
	fulfillingShop: CartShopView;
	resale: boolean;
	items: QuoteSummaryLine[];
	subtotal: number;
	delivery: { options: DeliveryOption[]; unavailable: string[] };
	selectedOptionId: string;
	deliveryFee: number;
	/** VAT on the platform commission of this group, at the market's rate. */
	vat: number;
	total: number;
	/** Bound to this group: it validates no other group's placement. */
	quoteHash: string;
}

export interface SplitQuoteView {
	market: { countryCode: string; currency: string };
	groups: SplitQuoteGroup[];
	unavailableGroups: Array<{ groupKey: string; reason: string }>;
	grandTotal: number;
	quoteHash: string;
}

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
			groups.push({
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
	};
}
