import type {
	DeliveryOption,
	DeliveryQuote,
	UnavailableOption,
} from "../../contracts/deliveryQuote";
import {
	nextDeliveryStart,
	pickupReadyAt,
	promisedByFrom,
} from "../../lib/delivery/eta";
import { haversineMeters } from "../../lib/delivery/geo";
import { getCourierProvider } from "../../lib/delivery/index";
import type { DeliverySettings } from "../../lib/deliverySettings";
import { isLaunchCityKey } from "../../lib/launchCities";
import { relationId } from "../../lib/relationId";
import type { Courier, DeliveryZone } from "../../payload-types";
import type { DeliveryQuoteInput } from "../deliveryQuote";
import { defaultOrigin } from "./locations";
import { resolveZonesFor } from "./zones";

export function intercityCodRefusal(
	scope: DeliveryZone["scope"],
	paymentMethod: "cod" | "mobile_money",
): "cod_not_allowed" | null {
	return scope === "intercity" && paymentMethod === "cod"
		? "cod_not_allowed"
		: null;
}

async function courierAvailable(
	input: DeliveryQuoteInput,
	zone: DeliveryZone,
	settings: DeliverySettings,
	cod: boolean,
): Promise<
	| { courier: Courier; codAllowed: boolean }
	| "cod_not_allowed"
	| "courier_unavailable"
> {
	if (!settings.couriersEnabled) return "courier_unavailable";
	const id = relationId(zone.courier);
	if (!id) return "courier_unavailable";
	const courier = await input.payload
		.findByID({ collection: "couriers", id, depth: 1, overrideAccess: true })
		.catch(() => null);
	if (
		!courier ||
		courier.status !== "active" ||
		!isLaunchCityKey(input.destination.city) ||
		!courier.cities.includes(input.destination.city) ||
		!courier.cities.includes(zone.city) ||
		!courier.scopes.includes(zone.scope)
	)
		return "courier_unavailable";
	if (cod && !courier.supportsCod) return "cod_not_allowed";
	try {
		const provider = getCourierProvider(courier.provider, {
			payload: input.payload,
			courier,
		});
		if (
			!provider.capabilities.quote ||
			(zone.scope === "intercity" && !provider.capabilities.intercity)
		)
			return "courier_unavailable";
		if (cod && !provider.capabilities.cod) return "cod_not_allowed";
		return {
			courier,
			codAllowed: courier.supportsCod === true && provider.capabilities.cod,
		};
	} catch {
		return "courier_unavailable";
	}
}

export async function zoneQuote(
	input: DeliveryQuoteInput,
	settings: DeliverySettings,
): Promise<DeliveryQuote> {
	const options: DeliveryOption[] = [];
	const unavailable: UnavailableOption[] = [];
	if (!isLaunchCityKey(input.destination.city)) return { options, unavailable };
	const now = input.now ?? new Date();
	const paymentMethod = input.paymentMethod ?? "cod";
	const productCod = input.items.every((item) => item.codAllowed);
	const origin = await defaultOrigin(input.payload, input.shop.id);
	const preparationHours = origin?.preparationHours ?? 0;
	const zones = await resolveZonesFor(input.payload, input.shop.id, {
		city: input.destination.city,
		district: input.destination.district,
	});
	if (settings.intercityEnabled) {
		const intercity = await input.payload.find({
			collection: "delivery-zones",
			where: {
				and: [
					{ shop: { equals: input.shop.id } },
					{ active: { equals: true } },
					{ scope: { equals: "intercity" } },
				],
			},
			limit: 0,
			pagination: false,
			depth: 0,
			overrideAccess: true,
		});
		for (const zone of intercity.docs) {
			if (
				zone.city !== input.destination.city &&
				zone.destinationCities?.includes(input.destination.city) &&
				!zones.has(zone.method)
			)
				zones.set(zone.method, zone);
		}
	}
	for (const zone of zones.values()) {
		if (input.method && input.method !== zone.method) continue;
		if (input.subtotal < (zone.minOrderSubtotal ?? 0)) {
			unavailable.push({
				method: zone.method,
				reason: "below_minimum",
				minOrderSubtotal: zone.minOrderSubtotal ?? 0,
			});
			continue;
		}
		let codAllowed =
			productCod &&
			zone.codAllowed !== false &&
			!intercityCodRefusal(zone.scope, "cod");
		if (paymentMethod === "cod" && !codAllowed) {
			unavailable.push({ method: zone.method, reason: "cod_not_allowed" });
			continue;
		}
		let courier: Courier | undefined;
		if (zone.method === "courier") {
			const state = await courierAvailable(
				input,
				zone,
				settings,
				paymentMethod === "cod",
			);
			if (typeof state === "string") {
				unavailable.push({
					method: zone.method,
					reason: state === "courier_unavailable" ? "not_served" : state,
				});
				continue;
			}
			courier = state.courier;
			codAllowed = codAllowed && state.codAllowed;
		}
		const calendar = {
			deliveryDays: zone.deliveryDays,
			cutoffTime: zone.cutoffTime ?? undefined,
		};
		const start = nextDeliveryStart(now, calendar);
		if (start.getTime() > now.getTime() + 7 * 86_400_000) continue;
		const promisedBy = promisedByFrom(
			start,
			preparationHours,
			zone.etaMaxHours,
			calendar,
		).toISOString();
		const freeApplied =
			zone.freeAboveSubtotal != null &&
			input.subtotal >= zone.freeAboveSubtotal;
		options.push({
			optionId: `zone:${zone.id}`,
			method: zone.method,
			fee: freeApplied ? 0 : zone.fee,
			etaText: `${zone.etaMinHours}-${zone.etaMaxHours}h`,
			codAllowed,
			zoneId: zone.id,
			...(relationId(zone.courier)
				? { courierId: relationId(zone.courier) ?? undefined }
				: {}),
			...(courier
				? {
						courier: {
							id: courier.id,
							name: courier.name,
							...(typeof courier.logo === "object" && courier.logo?.url
								? { logoUrl: courier.logo.url }
								: {}),
						},
					}
				: {}),
			etaMinHours: zone.etaMinHours,
			etaMaxHours: zone.etaMaxHours,
			promisedBy,
			freeApplied,
			originalFee: zone.fee,
			sourceUpdatedAt: zone.updatedAt,
		});
	}
	if (!input.method || input.method === "pickup") {
		const locations = await input.payload.find({
			collection: "shop-locations",
			where: {
				and: [
					{ shop: { equals: input.shop.id } },
					{ city: { equals: input.destination.city } },
					{ active: { equals: true } },
					{ pickupEnabled: { equals: true } },
				],
			},
			limit: 0,
			pagination: false,
			depth: 0,
			overrideAccess: true,
		});
		const gps = input.destination.gps;
		if (gps)
			locations.docs.sort(
				(a, b) => haversineMeters(gps, a.gps) - haversineMeters(gps, b.gps),
			);
		for (const location of locations.docs) {
			if (paymentMethod === "cod" && !productCod) {
				unavailable.push({ method: "pickup", reason: "cod_not_allowed" });
				continue;
			}
			const openingHours = location.openingHours ?? [];
			if (!openingHours.length) continue;
			const readyAt = pickupReadyAt(
				now,
				location.preparationHours ?? 2,
				openingHours,
			);
			options.push({
				optionId: `pickup:${location.id}`,
				method: "pickup",
				fee: location.pickupFee ?? 0,
				originalFee: location.pickupFee ?? 0,
				freeApplied: false,
				etaText: `${location.preparationHours ?? 2}h`,
				codAllowed: productCod,
				pickupLocationId: location.id,
				etaMinHours: location.preparationHours ?? 2,
				etaMaxHours: location.preparationHours ?? 2,
				promisedBy: readyAt.toISOString(),
				sourceUpdatedAt: location.updatedAt,
				pickupPoint: {
					address: location.address ?? null,
					landmark: location.landmark,
					gps: location.gps,
					hours: location.openingHoursNote ?? null,
					...(gps
						? { distanceMeters: Math.round(haversineMeters(gps, location.gps)) }
						: {}),
				},
			});
		}
	}
	return { options, unavailable };
}
