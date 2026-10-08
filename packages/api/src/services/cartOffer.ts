import type { Payload } from "payload";
import { ERROR_CODES } from "../lib/errors";
import { relationId } from "../lib/relationId";
import { getResaleSettings } from "../lib/resaleSettings";
import { ServiceError } from "../lib/serviceError";
import { shopCapabilities } from "../lib/shopCapabilities";
import type { TxReq } from "../lib/transactions";
import type {
	Listing,
	OrderItem,
	ProductVariant,
	Shop,
} from "../payload-types";
import { hasAcceptedCurrentResaleTerms } from "./resale";

export type CartOffer = Pick<
	OrderItem,
	"sourcing" | "resaleLink" | "supplierUnitPrice"
> & {
	unitPrice: number;
	fulfillingShop: Shop;
};

function unavailable(): never {
	throw new ServiceError(ERROR_CODES.cartItemUnavailable, 409);
}

export function cartRetailPrice(
	listing: Listing,
	variant: ProductVariant,
): number | null {
	if (!listing.resale?.supplierShop) return variant.price;
	return (
		listing.resale.prices?.find(
			(row) => relationId(row.variant) === String(variant.id),
		)?.price ?? null
	);
}

export async function resolveCartOffer(
	payload: Payload,
	listing: Listing,
	variant: ProductVariant,
	storefront: Shop,
	req?: TxReq,
): Promise<CartOffer> {
	if (relationId(listing.product) !== relationId(variant.product))
		unavailable();
	const supplierId = relationId(listing.resale?.supplierShop);
	if (!supplierId) {
		if (relationId(variant.shop) !== String(storefront.id)) unavailable();
		return {
			sourcing: "own",
			unitPrice: variant.price,
			fulfillingShop: storefront,
		};
	}
	const settings = await getResaleSettings(payload, req);
	if (!settings.enabled || listing.resale?.holds?.length) unavailable();
	const [supplier, product, link] = await Promise.all([
		payload
			.findByID({
				collection: "shops",
				id: supplierId,
				depth: 0,
				overrideAccess: true,
				req,
			})
			.catch(() => null),
		payload
			.findByID({
				collection: "products",
				id: relationId(variant.product) ?? "",
				depth: 0,
				overrideAccess: true,
				req,
			})
			.catch(() => null),
		payload
			.findByID({
				collection: "resale-links",
				id: relationId(listing.resale?.link) ?? "",
				depth: 0,
				overrideAccess: true,
				req,
			})
			.catch(() => null),
	]);
	if (
		!supplier ||
		!product ||
		!link ||
		!shopCapabilities(supplier).supplier ||
		supplier.ordersRestrictedAt ||
		!shopCapabilities(storefront).resell ||
		storefront.ordersRestrictedAt ||
		relationId(product.shop) !== supplierId ||
		relationId(variant.shop) !== supplierId ||
		product.status !== "active" ||
		product.resale?.enabled !== true ||
		product.resale.codAccepted !== true ||
		variant.resale?.enabled !== true ||
		link.status !== "approved" ||
		link.riskHold ||
		relationId(link.supplierShop) !== supplierId ||
		relationId(link.resellerShop) !== String(storefront.id)
	)
		unavailable();
	const accepted = await Promise.all([
		hasAcceptedCurrentResaleTerms(payload, supplierId, "supplier", req),
		hasAcceptedCurrentResaleTerms(
			payload,
			String(storefront.id),
			"reseller",
			req,
		),
	]);
	if (accepted.some((value) => !value)) unavailable();
	const overdue = await payload.count({
		collection: "reseller-charges",
		where: {
			and: [
				{ resellerShop: { equals: String(storefront.id) } },
				{ status: { equals: "overdue" } },
			],
		},
		overrideAccess: true,
		req,
	});
	if (overdue.totalDocs > 0) unavailable();
	const unitPrice = cartRetailPrice(listing, variant);
	const supplierUnitPrice = variant.resale?.supplierPrice;
	const minimum = variant.resale?.minRetailPrice;
	const suggested = variant.resale?.suggestedRetailPrice;
	if (
		typeof unitPrice !== "number" ||
		!Number.isSafeInteger(unitPrice) ||
		typeof supplierUnitPrice !== "number" ||
		!Number.isSafeInteger(supplierUnitPrice) ||
		supplierUnitPrice < 100 ||
		typeof minimum !== "number" ||
		typeof suggested !== "number" ||
		unitPrice < minimum ||
		unitPrice > suggested * 2
	)
		unavailable();
	return {
		sourcing: "resale",
		unitPrice,
		fulfillingShop: supplier,
		resaleLink: link.id,
		supplierUnitPrice,
	};
}
