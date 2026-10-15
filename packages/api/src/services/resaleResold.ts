import type { Payload } from "payload";
import type {
	ResoldListing,
	ResoldListingPage,
	ResoldListingStatus,
	UpdateResaleListingPricesInput,
} from "../contracts/resale";
import { ERROR_CODES } from "../lib/errors";
import { getOrderSettings } from "../lib/orderSettings";
import { relationId } from "../lib/relationId";
import { getResaleSettings } from "../lib/resaleSettings";
import { ServiceError } from "../lib/serviceError";
import { withTransaction } from "../lib/transactions";
import { cappedStockCount, variantLabel } from "../lib/variants";
import type { Listing, ProductVariant } from "../payload-types";
import { requireShopPermission } from "./shopGuards";
import type { ServiceUser } from "./shops";

type ListingHold = NonNullable<NonNullable<Listing["resale"]["holds"]>[number]>;

export function resoldListingStatus(
	listing: Pick<Listing, "status"> & {
		resale?: { desiredStatus?: string | null; holds?: ListingHold[] | null };
	},
	variants: ResoldListing["variants"],
): ResoldListingStatus {
	const holds = listing.resale?.holds ?? [];
	const belowMinimum = variants.some(
		(variant) =>
			variant.minRetailPrice !== null && variant.price < variant.minRetailPrice,
	);
	if (holds.includes("price_below_minimum") || belowMinimum)
		return "below_minimum";
	const tracked = variants.filter((variant) => variant.supplierStock !== null);
	if (
		holds.includes("supplier_unavailable") ||
		(tracked.length === variants.length &&
			tracked.length > 0 &&
			tracked.every((variant) => variant.supplierStock === 0))
	)
		return "out_of_stock";
	if (holds.includes("product_unavailable")) return "unavailable";
	if (holds.length > 0) return "held";
	if (listing.status === "published") return "on_sale";
	return "draft";
}

export async function listResoldListings(
	payload: Payload,
	user: ServiceUser,
	shopId: string,
): Promise<ResoldListingPage> {
	const settings = await getResaleSettings(payload);
	if (!settings.enabled)
		throw new ServiceError(ERROR_CODES.resaleDisabled, 404);
	await requireShopPermission(payload, user, shopId, "resale.manage");
	const result = await payload.find({
		collection: "listings",
		where: {
			and: [
				{ shop: { equals: shopId } },
				{ "resale.supplierShop": { not_equals: null } },
			],
		},
		sort: "title",
		limit: 0,
		pagination: false,
		depth: 0,
		overrideAccess: true,
	});
	const listings = result.docs.filter((listing) =>
		relationId(listing.resale?.supplierShop),
	);
	const productIds = [
		...new Set(
			listings
				.map((listing) => relationId(listing.product))
				.filter((id): id is string => id !== null),
		),
	];
	const supplierIds = [
		...new Set(
			listings
				.map((listing) => relationId(listing.resale?.supplierShop))
				.filter((id): id is string => id !== null),
		),
	];
	const [variants, suppliers, orderSettings] = await Promise.all([
		productIds.length > 0
			? payload.find({
					collection: "product-variants",
					where: { product: { in: productIds } },
					limit: 0,
					pagination: false,
					depth: 0,
					overrideAccess: true,
				})
			: Promise.resolve({ docs: [] as ProductVariant[] }),
		supplierIds.length > 0
			? payload.find({
					collection: "shops",
					where: { id: { in: supplierIds } },
					limit: 0,
					pagination: false,
					depth: 0,
					overrideAccess: true,
				})
			: Promise.resolve({ docs: [] }),
		getOrderSettings(payload),
	]);
	const variantById = new Map(
		variants.docs.map((variant) => [String(variant.id), variant]),
	);
	const supplierName = new Map(
		suppliers.docs.map((shop) => [String(shop.id), shop.name]),
	);
	return {
		commissionRateBps: orderSettings.defaultCommissionRateBps,
		listings: listings.flatMap((listing) => {
			const productId = relationId(listing.product);
			const supplierId = relationId(listing.resale?.supplierShop);
			if (!productId || !supplierId) return [];
			const rows = (listing.resale?.prices ?? []).flatMap((row) => {
				const variantId = relationId(row.variant);
				const variant = variantId ? variantById.get(variantId) : undefined;
				if (!variantId || !variant) return [];
				return [
					{
						id: variantId,
						label: variantLabel(variant.optionValues) || null,
						sku: variant.sku ?? null,
						price: row.price,
						supplierPrice: variant.resale?.supplierPrice ?? null,
						minRetailPrice: variant.resale?.minRetailPrice ?? null,
						suggestedRetailPrice: variant.resale?.suggestedRetailPrice ?? null,
						supplierStock: cappedStockCount(variant),
					},
				];
			});
			return [
				{
					listingId: String(listing.id),
					productId,
					title: listing.title,
					supplier: {
						id: supplierId,
						name: supplierName.get(supplierId) ?? "",
					},
					status: resoldListingStatus(listing, rows),
					variants: rows,
				},
			];
		}),
	};
}

/**
 * The reseller's way out of a `price_below_minimum` hold: new prices are
 * checked against the supplier's current bounds, then the hold is lifted and
 * the listing republished when nothing else holds it.
 */
export async function updateResaleListingPrices(
	payload: Payload,
	user: ServiceUser,
	shopId: string,
	listingId: string,
	input: UpdateResaleListingPricesInput,
): Promise<Listing> {
	return withTransaction(
		payload,
		async (req) => {
			const settings = await getResaleSettings(payload);
			if (!settings.enabled)
				throw new ServiceError(ERROR_CODES.resaleDisabled, 404);
			await requireShopPermission(payload, user, shopId, "resale.manage", {
				writable: true,
				req,
			});
			const listing = await payload
				.findByID({
					collection: "listings",
					id: listingId,
					depth: 0,
					overrideAccess: true,
					req,
				})
				.catch(() => null);
			const productId = relationId(listing?.product);
			const supplierShopId = relationId(listing?.resale?.supplierShop);
			if (
				!listing ||
				relationId(listing.shop) !== shopId ||
				!productId ||
				!supplierShopId
			) {
				throw new ServiceError(ERROR_CODES.notFound, 404);
			}
			const variantResult = await payload.find({
				collection: "product-variants",
				where: {
					and: [
						{ product: { equals: productId } },
						{ "resale.enabled": { equals: true } },
						{ archivedAt: { exists: false } },
					],
				},
				limit: 0,
				pagination: false,
				depth: 0,
				overrideAccess: true,
				req,
			});
			const variants = variantResult.docs;
			const priceByVariant = new Map(
				input.prices.map(({ variantId, price }) => [variantId, price]),
			);
			if (
				variants.length === 0 ||
				input.prices.length !== variants.length ||
				priceByVariant.size !== variants.length
			) {
				throw new ServiceError(ERROR_CODES.resaleInvalidPricing, 400);
			}
			for (const variant of variants) {
				const price = priceByVariant.get(String(variant.id));
				const minimum = variant.resale?.minRetailPrice;
				const suggested = variant.resale?.suggestedRetailPrice;
				if (
					typeof price !== "number" ||
					!Number.isSafeInteger(price) ||
					typeof minimum !== "number" ||
					typeof suggested !== "number" ||
					price < minimum ||
					price > suggested * 2
				) {
					throw new ServiceError(ERROR_CODES.resaleInvalidPricing, 400);
				}
			}
			const prices = variants.map((variant) => ({
				variant: String(variant.id),
				price: priceByVariant.get(String(variant.id)) ?? 0,
			}));
			const amounts = prices.map((row) => row.price);
			const minimumPrice = Math.min(...amounts);
			const maximumPrice = Math.max(...amounts);
			const holds = (listing.resale?.holds ?? []).filter(
				(hold) => hold !== "price_below_minimum",
			);
			const supplierListing = await payload.find({
				collection: "listings",
				where: {
					and: [
						{ shop: { equals: supplierShopId } },
						{ product: { equals: productId } },
						{ status: { equals: "published" } },
					],
				},
				limit: 1,
				pagination: false,
				depth: 0,
				overrideAccess: true,
				req,
			});
			const status =
				listing.resale?.desiredStatus === "published" &&
				holds.length === 0 &&
				listing.moderationHold !== true &&
				supplierListing.docs.length > 0
					? "published"
					: "draft";
			return payload.update({
				collection: "listings",
				id: listingId,
				data: {
					status,
					price: minimumPrice,
					...(listing.productSummary
						? {
								productSummary: {
									...listing.productSummary,
									priceMin: minimumPrice,
									priceMax: maximumPrice,
								},
							}
						: {}),
					resale: { ...listing.resale, prices, holds },
				},
				depth: 0,
				overrideAccess: true,
				context: { resaleService: true, productService: true },
				req,
			});
		},
		{ user, context: { resaleService: true } },
	);
}
