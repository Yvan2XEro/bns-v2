import type { Payload } from "payload";
import {
	isLaunchCityKey,
	LAUNCH_CITIES,
	type LaunchCityKey,
} from "./launchCities";
import type { CodCaps } from "./shopCapabilities";

export type BuyerTierKey = "new" | "regular" | "trusted" | "watch" | "blocked";

export interface BuyerCapRow {
	maxOpenOrders: number;
	/** Null means "the shop cap alone decides". */
	maxOrderTotal: number | null;
	confirmation: "auto_or_code" | "code_or_call" | "call" | "refused";
}

export interface OrderSettings {
	enabled: boolean;
	launchCities: Array<{ key: LaunchCityKey; deliveryFee: number }>;
	defaultCommissionRateBps: number;
	vatRateBps: number;
	minInvoiceAmount: number;
	invoiceDueDays: number;
	restrictAfterOverdueDays: number;
	confirmHours: number;
	acceptHours: number;
	withdrawalDays: number;
	staleShippedDays: number;
	shopCaps: Partial<Record<1 | 2 | 3, Partial<CodCaps>>>;
	buyerCaps: Record<BuyerTierKey, BuyerCapRow>;
	termsVersion: string;
	pilotShopIds: string[];
}

export const BUYER_CAPS: Record<BuyerTierKey, BuyerCapRow> = {
	new: {
		maxOpenOrders: 1,
		maxOrderTotal: 75_000,
		confirmation: "code_or_call",
	},
	regular: {
		maxOpenOrders: 3,
		maxOrderTotal: 200_000,
		confirmation: "code_or_call",
	},
	trusted: {
		maxOpenOrders: 5,
		maxOrderTotal: null,
		confirmation: "auto_or_code",
	},
	watch: { maxOpenOrders: 1, maxOrderTotal: 75_000, confirmation: "call" },
	blocked: { maxOpenOrders: 0, maxOrderTotal: null, confirmation: "refused" },
};

const DEFAULTS: Omit<OrderSettings, "enabled" | "launchCities"> = {
	defaultCommissionRateBps: 800,
	vatRateBps: 1925,
	minInvoiceAmount: 500,
	invoiceDueDays: 7,
	restrictAfterOverdueDays: 3,
	confirmHours: 24,
	acceptHours: 48,
	withdrawalDays: 15,
	staleShippedDays: 14,
	shopCaps: {},
	buyerCaps: BUYER_CAPS,
	termsVersion: "2026-09",
	pilotShopIds: [],
};

const intOr = (value: unknown, fallback: number): number => {
	const n = Number(value);
	return Number.isInteger(n) && n >= 0 ? n : fallback;
};

const CAP_LEVELS = [1, 2, 3] as const;
const COD_CAP_KEYS = [
	"maxOrderTotal",
	"maxDailyOrders",
	"maxOpenOrders",
] as const;
const BUYER_TIER_KEYS = [
	"new",
	"regular",
	"trusted",
	"watch",
	"blocked",
] as const;
const CONFIRMATIONS = new Set([
	"auto_or_code",
	"code_or_call",
	"call",
	"refused",
]);

/**
 * The admin's per-level cap overrides, kept only where they are sane: a
 * non-negative integer under a known key of a known level. The global's two
 * cap fields are free-form JSON, and a typo'd override that silently became
 * `undefined` would re-open the cap it meant to tighten — so anything
 * unrecognised is dropped, never passed through.
 */
function shopCapsOf(value: unknown): OrderSettings["shopCaps"] {
	if (value === null || typeof value !== "object") return {};
	const out: OrderSettings["shopCaps"] = {};
	for (const level of CAP_LEVELS) {
		const row = (value as Record<string, unknown>)[String(level)];
		if (row === null || typeof row !== "object") continue;
		const caps: Partial<CodCaps> = {};
		for (const key of COD_CAP_KEYS) {
			const n = Number((row as Record<string, unknown>)[key]);
			if (Number.isInteger(n) && n >= 0) caps[key] = n;
		}
		if (Object.keys(caps).length > 0) out[level] = caps;
	}
	return out;
}

/** Same discipline per buyer tier, merged row-wise onto BUYER_CAPS. */
function buyerCapsOf(value: unknown): OrderSettings["buyerCaps"] {
	const out = { ...BUYER_CAPS };
	if (value === null || typeof value !== "object") return out;
	for (const tier of BUYER_TIER_KEYS) {
		const row = (value as Record<string, unknown>)[tier];
		if (row === null || typeof row !== "object") continue;
		const patch: Partial<BuyerCapRow> = {};
		const open = Number((row as Record<string, unknown>).maxOpenOrders);
		if (Number.isInteger(open) && open >= 0) patch.maxOpenOrders = open;
		const total = (row as Record<string, unknown>).maxOrderTotal;
		if (total === null) patch.maxOrderTotal = null;
		else if (Number.isInteger(Number(total)) && Number(total) >= 0)
			patch.maxOrderTotal = Number(total);
		const confirmation = (row as Record<string, unknown>).confirmation;
		if (typeof confirmation === "string" && CONFIRMATIONS.has(confirmation))
			patch.confirmation = confirmation as BuyerCapRow["confirmation"];
		if (Object.keys(patch).length > 0) out[tier] = { ...out[tier], ...patch };
	}
	return out;
}

function citiesOf(value: unknown): OrderSettings["launchCities"] {
	if (!Array.isArray(value)) {
		return [
			{ key: "douala", deliveryFee: LAUNCH_CITIES.douala.defaultDeliveryFee },
			{ key: "yaounde", deliveryFee: LAUNCH_CITIES.yaounde.defaultDeliveryFee },
		];
	}
	return value.flatMap((row) => {
		const key = (row as { key?: unknown })?.key;
		if (!isLaunchCityKey(key)) return [];
		const fee = intOr(
			(row as { deliveryFee?: unknown }).deliveryFee,
			LAUNCH_CITIES[key].defaultDeliveryFee,
		);
		return [{ key, deliveryFee: fee }];
	});
}

/** Fails closed: an unreadable settings global means ordering stays off. */
export async function getOrderSettings(
	payload: Payload,
): Promise<OrderSettings> {
	try {
		const global = await payload.findGlobal({
			slug: "app-settings",
			depth: 0,
			overrideAccess: true,
		});
		const orders = (global as { orders?: Record<string, unknown> }).orders;
		if (!orders)
			return { ...DEFAULTS, enabled: false, launchCities: citiesOf(undefined) };
		return {
			...DEFAULTS,
			enabled: orders.enabled === true,
			launchCities: citiesOf(orders.launchCities),
			defaultCommissionRateBps: intOr(orders.defaultCommissionRateBps, 800),
			vatRateBps: intOr(orders.vatRateBps, 1925),
			minInvoiceAmount: intOr(orders.minInvoiceAmount, 500),
			invoiceDueDays: intOr(orders.invoiceDueDays, 7),
			restrictAfterOverdueDays: intOr(orders.restrictAfterOverdueDays, 3),
			confirmHours: intOr(orders.confirmHours, 24),
			acceptHours: intOr(orders.acceptHours, 48),
			withdrawalDays: intOr(orders.withdrawalDays, 15),
			staleShippedDays: intOr(orders.staleShippedDays, 14),
			termsVersion:
				typeof orders.termsVersion === "string" && orders.termsVersion
					? orders.termsVersion
					: "2026-09",
			shopCaps: shopCapsOf(orders.shopCaps),
			buyerCaps: buyerCapsOf(orders.buyerCaps),
			pilotShopIds: Array.isArray(orders.pilotShopIds)
				? orders.pilotShopIds.map(String)
				: [],
		};
	} catch {
		return { ...DEFAULTS, enabled: false, launchCities: citiesOf(undefined) };
	}
}

export function deliveryFeeFor(
	settings: OrderSettings,
	city: LaunchCityKey,
): number | null {
	return (
		settings.launchCities.find((row) => row.key === city)?.deliveryFee ?? null
	);
}

/**
 * What a launch city charges when the shop sets no override of its own: the
 * settings global's figure for that city, else the city's built-in default.
 * `quoteDelivery` falls back to exactly this, so a seller shown it as the
 * default is shown the fee a buyer would really be charged.
 */
export function cityDeliveryFee(
	settings: OrderSettings,
	city: LaunchCityKey,
): number {
	return (
		deliveryFeeFor(settings, city) ?? LAUNCH_CITIES[city].defaultDeliveryFee
	);
}

/** An empty pilot list means every eligible shop; a non-empty one is a whitelist. */
export function isPilotShop(settings: OrderSettings, shopId: string): boolean {
	return (
		settings.pilotShopIds.length === 0 || settings.pilotShopIds.includes(shopId)
	);
}
