import { createHash } from "node:crypto";
import type { Payload } from "payload";
import {
	type PublicDeliveryEstimates,
	publicDeliveryEstimatesSchema,
} from "../../contracts/deliveryQuote";
import type { DeliveryEstimateCache } from "../../lib/delivery/estimateCache";
import { getDeliverySettings } from "../../lib/deliverySettings";
import { ERROR_CODES } from "../../lib/errors";
import { getOrderSettings } from "../../lib/orderSettings";
import { relationId } from "../../lib/relationId";
import { ServiceError } from "../../lib/serviceError";
import type { User } from "../../payload-types";
import { quoteDelivery } from "../deliveryQuote";

export async function publicDeliveryEstimates(
	payload: Payload,
	listingId: string,
	destination: { city?: string; district?: string },
	homeLocation?: User["homeLocation"],
	cache?: DeliveryEstimateCache,
): Promise<PublicDeliveryEstimates> {
	const visible = await payload.find({
		collection: "listings",
		where: { id: { equals: listingId } },
		limit: 1,
		depth: 0,
		overrideAccess: false,
	});
	const listing = visible.docs[0];
	if (!listing) throw new ServiceError(ERROR_CODES.notFound, 404);
	const shopId =
		relationId(listing.resale?.supplierShop) ?? relationId(listing.shop);
	if (!shopId) return { perMethod: [] };
	const shop = await payload.findByID({
		collection: "shops",
		id: shopId,
		depth: 0,
		overrideAccess: false,
	});
	const city = destination.city ?? homeLocation?.city ?? shop.location?.city;
	if (!city) return { perMethod: [] };
	const settings = await getOrderSettings(payload);
	const delivery = await getDeliverySettings(payload);
	if (!settings.enabled || !delivery.zonesEnabled) return { perMethod: [] };
	const productId = relationId(listing.product);
	const product = productId
		? await payload.findByID({
				collection: "products",
				id: productId,
				depth: 0,
				overrideAccess: true,
			})
		: null;
	const subtotal = listing.price ?? 0;
	const codAllowed = product?.delivery?.codAllowed !== false;
	let key: string | undefined;
	if (cache) {
		const zones = await payload.find({
			collection: "delivery-zones",
			where: { shop: { equals: shopId } },
			limit: 0,
			pagination: false,
			depth: 0,
			overrideAccess: true,
		});
		const locations = await payload.find({
			collection: "shop-locations",
			where: { shop: { equals: shopId } },
			limit: 0,
			pagination: false,
			depth: 0,
			overrideAccess: true,
		});
		const couriers = await payload.find({
			collection: "couriers",
			limit: 0,
			pagination: false,
			depth: 0,
			overrideAccess: true,
		});
		// Include ids as well as revisions: deletion must invalidate an estimate too.
		const revision = (rows: { id: string; updatedAt: string }[]) =>
			rows
				.map((row) => [row.id, row.updatedAt])
				.sort(([a], [b]) => a.localeCompare(b));
		key = `delivery-estimate:${createHash("sha256")
			.update(
				JSON.stringify({
					shop,
					city,
					district: destination.district ?? "",
					subtotal,
					codAllowed,
					settings,
					delivery,
					zones: revision(zones.docs),
					locations: revision(locations.docs),
					couriers: revision(couriers.docs),
				}),
			)
			.digest("hex")}`;
		try {
			const cached = await cache.get(key);
			if (cached) {
				const parsed = publicDeliveryEstimatesSchema.safeParse(
					JSON.parse(cached),
				);
				if (parsed.success) return parsed.data;
			}
		} catch (error) {
			payload.logger.warn({
				err: error,
				msg: "Delivery estimate cache read failed",
			});
		}
	}
	const quoted = await quoteDelivery({
		payload,
		shop,
		items: [
			{
				variantId: productId ?? listing.id,
				quantity: 1,
				lineSubtotal: subtotal,
				codAllowed,
			},
		],
		subtotal,
		destination: { city, district: destination.district },
		settings,
	});
	const byMethod = new Map<
		string,
		PublicDeliveryEstimates["perMethod"][number]
	>();
	for (const option of quoted.options) {
		const previous = byMethod.get(option.method);
		if (!previous || option.fee < previous.cheapestFee)
			byMethod.set(option.method, {
				method: option.method,
				cheapestFee: option.fee,
				etaMinHours: option.etaMinHours ?? 0,
				etaMaxHours: option.etaMaxHours ?? 0,
			});
	}
	const result = { perMethod: [...byMethod.values()] };
	if (cache && key) {
		try {
			await cache.set(key, JSON.stringify(result), 300);
		} catch (error) {
			payload.logger.warn({
				err: error,
				msg: "Delivery estimate cache write failed",
			});
		}
	}
	return result;
}
