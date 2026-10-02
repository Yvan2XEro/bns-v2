import type { Payload } from "payload";
import { isLaunchCityKey } from "../lib/launchCities";
import {
	cityDeliveryFee,
	getOrderSettings,
	type OrderSettings,
} from "../lib/orderSettings";
import { type PickupPointView, pickupPointView } from "../lib/pickupPointView";
import {
	type CodCaps,
	codCaps,
	shopCapabilities,
} from "../lib/shopCapabilities";
import type { Shop } from "../payload-types";
import { requireShopPermission } from "./shopGuards";
import type { ServiceUser } from "./shops";

/** The plan's `OrderSettingsView`. */
export interface OrderSettingsView {
	codEnabled: boolean;
	sellerDeliveryEnabled: boolean;
	deliveryFee: number | null;
	deliveryEtaText: string | null;
	pickupEnabled: boolean;
	pickupPoint: PickupPointView | null;
	salesTermsExtra: string | null;
	caps: CodCaps | null;
	cityDefaultFee: number | null;
}

export type ShopOrderSettingsGroup = NonNullable<Shop["orderSettings"]>;

/**
 * The two server-derived fields. `caps` is `codCaps` of the shop's *effective*
 * level — the same figure checkout enforces, so a seller is never shown a
 * ceiling an order would not actually be refused at — and it is null exactly
 * when the level grants no COD at all. `cityDefaultFee` is what
 * `quoteDelivery` falls back to when `deliveryFee` is unset, so the form can
 * show the fee a buyer would really be charged.
 */
function derived(
	shop: Shop,
	settings: OrderSettings,
	now: Date,
): { caps: CodCaps | null; cityDefaultFee: number | null } {
	const city = shop.location?.city;
	return {
		caps: codCaps(
			shopCapabilities(shop, now).effectiveLevel,
			settings.shopCaps,
		),
		cityDefaultFee: isLaunchCityKey(city)
			? cityDeliveryFee(settings, city)
			: null,
	};
}

function view(
	shop: Shop,
	settings: OrderSettings,
	now: Date,
): OrderSettingsView {
	const group: ShopOrderSettingsGroup = shop.orderSettings ?? {};
	return {
		codEnabled: group.codEnabled === true,
		// The collection's own default is true, so an absent value reads as on.
		sellerDeliveryEnabled: group.sellerDeliveryEnabled !== false,
		deliveryFee: group.deliveryFee ?? null,
		deliveryEtaText: group.deliveryEtaText ?? null,
		pickupEnabled: group.pickupEnabled === true,
		pickupPoint: pickupPointView(group.pickupPoint),
		salesTermsExtra: group.salesTermsExtra ?? null,
		...derived(shop, settings, now),
	};
}

/**
 * `payments.view` (owner/manager, not staff), the same gate `getBillingView`
 * uses: `caps` and `cityDefaultFee` are the shop's commercial ceilings, which
 * a staff member who processes orders has no business reading.
 */
export async function getOrderSettingsView(
	payload: Payload,
	user: ServiceUser,
	shopId: string,
	options: { now?: Date } = {},
): Promise<OrderSettingsView> {
	const { shop } = await requireShopPermission(
		payload,
		user,
		shopId,
		"payments.view",
	);
	return view(shop, await getOrderSettings(payload), options.now ?? new Date());
}

export interface OrderSettingsUpdate {
	codEnabled?: boolean;
	sellerDeliveryEnabled?: boolean;
	deliveryFee?: number | null;
	deliveryEtaText?: string | null;
	pickupEnabled?: boolean;
	pickupPoint?: {
		address?: string | null;
		landmark?: string | null;
		gps?: { lat?: number | null; lng?: number | null } | null;
		hours?: string | null;
	} | null;
	salesTermsExtra?: string | null;
}

/**
 * Only the keys the caller sent are written: the form edits one toggle at a
 * time, and a missing key must not blank a field the seller never touched.
 */
function merge(
	current: ShopOrderSettingsGroup,
	patch: OrderSettingsUpdate,
): ShopOrderSettingsGroup {
	const next: ShopOrderSettingsGroup = { ...current };
	if (patch.codEnabled !== undefined) next.codEnabled = patch.codEnabled;
	if (patch.sellerDeliveryEnabled !== undefined)
		next.sellerDeliveryEnabled = patch.sellerDeliveryEnabled;
	if (patch.deliveryFee !== undefined) next.deliveryFee = patch.deliveryFee;
	if (patch.deliveryEtaText !== undefined)
		next.deliveryEtaText = patch.deliveryEtaText;
	if (patch.pickupEnabled !== undefined)
		next.pickupEnabled = patch.pickupEnabled;
	if (patch.salesTermsExtra !== undefined)
		next.salesTermsExtra = patch.salesTermsExtra;
	if (patch.pickupPoint !== undefined) {
		const point = patch.pickupPoint;
		next.pickupPoint = point
			? {
					...(current.pickupPoint ?? {}),
					...(point.address !== undefined ? { address: point.address } : {}),
					...(point.landmark !== undefined ? { landmark: point.landmark } : {}),
					...(point.hours !== undefined ? { hours: point.hours } : {}),
					...(point.gps !== undefined
						? { gps: point.gps ? { ...point.gps } : {} }
						: {}),
				}
			: {};
	}
	return next;
}

/**
 * `settings.edit` (owner/manager), the permission `Shops.access.update`
 * already requires for this group — so the dedicated route and a plain
 * `PATCH /api/shops/{id}` cannot disagree about who may change it. `writable`
 * adds the suspension and `shop.inactive` checks every shop write runs.
 */
export async function updateOrderSettings(
	payload: Payload,
	user: ServiceUser,
	shopId: string,
	patch: OrderSettingsUpdate,
	options: { now?: Date } = {},
): Promise<OrderSettingsView> {
	const { shop } = await requireShopPermission(
		payload,
		user,
		shopId,
		"settings.edit",
		{ writable: true },
	);
	// No `shopService` context: `orderSettings` is seller-owned, so the
	// collection's own `beforeChange` guard stays in force and keeps pinning
	// the service fields this write must not be able to reach.
	const updated = await payload.update({
		collection: "shops",
		id: String(shop.id),
		depth: 0,
		overrideAccess: true,
		data: { orderSettings: merge(shop.orderSettings ?? {}, patch) },
	});
	return view(
		updated,
		await getOrderSettings(payload),
		options.now ?? new Date(),
	);
}
