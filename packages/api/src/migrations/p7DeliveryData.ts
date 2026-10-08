import type { Payload } from "payload";
import { SHOP_SERVICE_CONTEXT } from "../collections/Shops";
import { queueSearchEvent } from "../hooks/searchEvents";
import { FAILURE_REASONS, type FailureReason } from "../lib/delivery/types";
import { getDeliverySettings } from "../lib/deliverySettings";
import { isLaunchCityKey } from "../lib/launchCities";
import { cityDeliveryFee, getOrderSettings } from "../lib/orderSettings";
import { relationId } from "../lib/relationId";
import { notifyDeliverySettingsIncomplete } from "../services/delivery/notifications";
import { nextNumber } from "../services/sequences";

const migrationContext = { p7DeliveryMigration: true };
const source = "p4";

function migratedFailureReason(value: unknown): FailureReason | null {
	const reason = FAILURE_REASONS.find((candidate) => candidate === value);
	if (reason) return reason;
	return value === "timeout" ? "other" : null;
}

export async function migrateP4DeliveryData(payload: Payload): Promise<void> {
	const settings = await getOrderSettings(payload);
	const deliverySettings = await getDeliverySettings(payload);
	const shops = await payload.find({
		collection: "shops",
		depth: 0,
		limit: 0,
		pagination: false,
		overrideAccess: true,
	});

	for (const shop of shops.docs) {
		const city = shop.location?.city;
		const shopId = String(shop.id);
		const legacy = shop.orderSettings;
		if (!isLaunchCityKey(city) || !legacy) continue;
		let deliveryChanged = false;

		if (legacy.codEnabled && legacy.sellerDeliveryEnabled) {
			const { totalDocs } = await payload.count({
				collection: "delivery-zones",
				where: {
					and: [
						{ shop: { equals: shopId } },
						{ "metadata.migratedFrom": { equals: source } },
					],
				},
				overrideAccess: true,
			});
			if (totalDocs === 0) {
				await payload.create({
					collection: "delivery-zones",
					overrideAccess: true,
					data: {
						shop: shopId,
						name: "Toute la ville",
						scope: "same_city",
						city,
						districts: [],
						method: "seller_delivery",
						fee: legacy.deliveryFee ?? cityDeliveryFee(settings, city),
						etaMinHours: 24,
						etaMaxHours: 48,
						deliveryDays: ["mon", "tue", "wed", "thu", "fri", "sat"],
						codAllowed: true,
						active: true,
						metadata: { migratedFrom: source },
					},
				});
				deliveryChanged = true;
			}
		}

		const pickup = legacy.pickupPoint;
		if (
			legacy.pickupEnabled &&
			pickup?.gps &&
			typeof pickup.gps.lat === "number" &&
			typeof pickup.gps.lng === "number" &&
			typeof pickup.landmark === "string" &&
			pickup.landmark.length >= 5
		) {
			const { totalDocs } = await payload.count({
				collection: "shop-locations",
				where: {
					and: [
						{ shop: { equals: shopId } },
						{ "metadata.migratedFrom": { equals: source } },
					],
				},
				overrideAccess: true,
			});
			if (totalDocs === 0) {
				await payload.create({
					collection: "shop-locations",
					context: migrationContext,
					overrideAccess: true,
					data: {
						shop: shopId,
						name: pickup.address || pickup.landmark,
						city,
						district: `${city}.other`,
						address: pickup.address ?? undefined,
						landmark: pickup.landmark,
						gps: { lat: pickup.gps.lat, lng: pickup.gps.lng },
						openingHours: [],
						openingHoursNote: pickup.hours ?? undefined,
						pickupEnabled: true,
						isDispatchOrigin: true,
						isDefaultOrigin: true,
						active: true,
						metadata: { migratedFrom: source },
					},
				});
				deliveryChanged = true;
			}
		}

		const [activeZones, activePickupLocations] = await Promise.all([
			payload.count({
				collection: "delivery-zones",
				where: {
					and: [
						{ shop: { equals: shopId } },
						{ active: { equals: true } },
						{ codAllowed: { equals: true } },
						...(deliverySettings.intercityEnabled
							? []
							: [{ scope: { equals: "same_city" } }]),
					],
				},
				overrideAccess: true,
			}),
			payload.count({
				collection: "shop-locations",
				where: {
					and: [
						{ shop: { equals: shopId } },
						{ active: { equals: true } },
						{ pickupEnabled: { equals: true } },
					],
				},
				overrideAccess: true,
			}),
		]);
		const noActiveOption =
			legacy.codEnabled === true &&
			activeZones.totalDocs + activePickupLocations.totalDocs === 0;
		const needsStructuredPickupHours = legacy.pickupEnabled === true;
		const ownerId = relationId(shop.owner);
		const shouldNotify = needsStructuredPickupHours || noActiveOption;
		if (shouldNotify && ownerId && !shop.deliveryMigrationNoticeSentAt) {
			await payload.update({
				collection: "shops",
				id: shopId,
				context: SHOP_SERVICE_CONTEXT,
				overrideAccess: true,
				data: { deliveryMigrationNoticeSentAt: new Date().toISOString() },
			});
			await notifyDeliverySettingsIncomplete(ownerId, shopId, {
				needsStructuredPickupHours,
				noActiveOption,
			});
			deliveryChanged = true;
		}
		if (deliveryChanged)
			await queueSearchEvent(undefined, "shop.updated", shopId, {
				reindexListings: true,
			});
	}

	const orders = await payload.find({
		collection: "orders",
		where: { status: { equals: "shipped" } },
		depth: 0,
		limit: 0,
		pagination: false,
		overrideAccess: true,
	});
	for (const order of orders.docs) {
		const orderId = String(order.id);
		const existing = await payload.find({
			collection: "shipments",
			where: {
				and: [
					{ order: { equals: orderId } },
					{ status: { not_equals: "cancelled" } },
				],
			},
			depth: 0,
			limit: 1,
			overrideAccess: true,
		});
		let shipmentId = existing.docs[0] ? String(existing.docs[0].id) : null;
		if (!shipmentId) {
			const shopId = relationId(order.shop);
			if (!shopId) continue;
			const shop = await payload
				.findByID({
					collection: "shops",
					id: shopId,
					depth: 0,
					overrideAccess: true,
				})
				.catch(() => null);
			const origins = await payload.find({
				collection: "shop-locations",
				where: {
					and: [
						{ shop: { equals: shopId } },
						{ active: { equals: true } },
						{ isDispatchOrigin: { equals: true } },
					],
				},
				depth: 0,
				limit: 10,
				overrideAccess: true,
			});
			const originLocation =
				origins.docs.find((location) => location.isDefaultOrigin) ??
				origins.docs[0];
			const origin = originLocation
				? {
						id: String(originLocation.id),
						address: originLocation.address ?? null,
						district: originLocation.district,
						city: originLocation.city,
						landmark: originLocation.landmark,
						gps: originLocation.gps,
					}
				: {
						id: null,
						address: null,
						district: null,
						city: shop?.location?.city ?? order.delivery.city ?? "",
						landmark: null,
						gps: null,
					};
			const items = await payload.find({
				collection: "order-items",
				where: { order: { equals: orderId } },
				depth: 0,
				limit: 0,
				pagination: false,
				overrideAccess: true,
			});
			if (items.docs.length === 0) continue;
			const events = await payload.find({
				collection: "order-events",
				where: {
					and: [
						{ order: { equals: orderId } },
						{ type: { equals: "order.delivery_attempt_failed" } },
					],
				},
				depth: 0,
				limit: 0,
				pagination: false,
				overrideAccess: true,
				sort: "createdAt",
			});
			const pickup = order.delivery.method === "pickup";
			const shippedAt = order.timestamps?.shippedAt ?? order.updatedAt;
			const shipmentNumber = await nextNumber(
				payload,
				"SHP",
				new Date(shippedAt),
			);
			const shipment = await payload.create({
				collection: "shipments",
				overrideAccess: true,
				data: {
					shipmentNumber,
					order: orderId,
					storefrontShop: shopId,
					fulfillingShop: shopId,
					items: items.docs.map((item) => ({
						orderItem: String(item.id),
						quantity: item.quantity,
					})),
					method: pickup ? "pickup" : "seller_delivery",
					carrier: "self",
					status: pickup ? "pending" : "in_transit",
					pickupLocation:
						relationId(order.delivery.pickupLocation) ??
						(pickup ? originLocation?.id : undefined),
					origin,
					destination: {
						city: order.delivery.city,
						district: order.delivery.district,
						landmark: order.delivery.landmark,
						phone: order.delivery.phone,
						recipientName: order.delivery.recipientName,
					},
					fee: order.delivery.fee ?? order.amounts?.deliveryFee ?? 0,
					attempts: events.docs.flatMap((event, index) => {
						const reason = migratedFailureReason(event.reason);
						return reason
							? [
									{
										number: index + 1,
										outcome: "failed" as const,
										reason,
										actorType: "system" as const,
										at: event.createdAt ?? shippedAt,
									},
								]
							: [];
					}),
					...(pickup
						? { readyForPickupAt: shippedAt }
						: { inTransitAt: shippedAt }),
					metadata: { migratedFrom: source },
				},
			});
			shipmentId = String(shipment.id);
		}
		const linkedShipmentIds = (order.shipments ?? [])
			.map((shipment) => relationId(shipment))
			.filter((id): id is string => id !== null);
		if (!linkedShipmentIds.includes(shipmentId))
			linkedShipmentIds.push(shipmentId);
		await payload.update({
			collection: "orders",
			id: orderId,
			overrideAccess: true,
			context: { orderService: true },
			data: { shipments: linkedShipmentIds },
		});
	}
}
