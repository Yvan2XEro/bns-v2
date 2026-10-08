import type { Payload } from "payload";
import type { CreateResaleListingInput } from "../contracts/resale";
import { ERROR_CODES } from "../lib/errors";
import { deriveListingData } from "../lib/productListing";
import { relationId } from "../lib/relationId";
import { getResaleSettings } from "../lib/resaleSettings";
import { ServiceError } from "../lib/serviceError";
import { shopCapabilities } from "../lib/shopCapabilities";
import { RetryTransaction, withTransaction } from "../lib/transactions";
import type { Listing } from "../payload-types";
import { hasAcceptedCurrentResaleTerms } from "./resale";
import { sharesActiveResaleIdentity } from "./resaleLinks";
import { requireShopPermission } from "./shopGuards";
import { isUniqueViolation, type ServiceUser } from "./shops";

export async function createResaleListing(
	payload: Payload,
	user: ServiceUser,
	resellerShopId: string,
	input: CreateResaleListingInput,
): Promise<Listing> {
	return withTransaction(
		payload,
		async (req) => {
			const settings = await getResaleSettings(payload);
			if (!settings.enabled)
				throw new ServiceError(ERROR_CODES.resaleDisabled, 404);

			const { shop: reseller } = await requireShopPermission(
				payload,
				user,
				resellerShopId,
				"resale.manage",
				{ writable: true, req },
			);
			if (!shopCapabilities(reseller).resell) {
				throw new ServiceError(ERROR_CODES.resaleResellerNotEligible, 403);
			}
			if (
				!(await hasAcceptedCurrentResaleTerms(
					payload,
					resellerShopId,
					"reseller",
				))
			) {
				throw new ServiceError(ERROR_CODES.resaleTermsNotAccepted, 409);
			}
			const overdue = await payload.find({
				collection: "reseller-charges",
				where: {
					and: [
						{ resellerShop: { equals: resellerShopId } },
						{ status: { equals: "overdue" } },
					],
				},
				limit: 1,
				pagination: false,
				depth: 0,
				overrideAccess: true,
				req,
			});
			if (overdue.docs.length > 0)
				throw new ServiceError(ERROR_CODES.resaleChargeOverdue, 409);

			const product = await payload
				.findByID({
					collection: "products",
					id: input.productId,
					depth: 0,
					overrideAccess: true,
					req,
				})
				.catch(() => null);
			const supplierShopId = relationId(product?.shop);
			if (
				!product ||
				product.status !== "active" ||
				product.resale?.enabled !== true ||
				!supplierShopId
			) {
				throw new ServiceError(ERROR_CODES.notFound, 404);
			}
			const supplier = await payload
				.findByID({
					collection: "shops",
					id: supplierShopId,
					depth: 0,
					overrideAccess: true,
					req,
				})
				.catch(() => null);
			if (
				!supplier ||
				supplier.status !== "active" ||
				String(supplier.id) === String(reseller.id) ||
				relationId(supplier.owner) === relationId(reseller.owner) ||
				(await sharesActiveResaleIdentity(req, supplier, reseller))
			) {
				throw new ServiceError(ERROR_CODES.resaleOwnProduct, 409);
			}
			if (!shopCapabilities(supplier).supplier) {
				throw new ServiceError(ERROR_CODES.resaleSupplierNotEligible, 409);
			}
			if (
				!(await hasAcceptedCurrentResaleTerms(
					payload,
					supplierShopId,
					"supplier",
				))
			) {
				throw new ServiceError(ERROR_CODES.resaleTermsNotAccepted, 409);
			}

			const existingListing = await payload.find({
				collection: "listings",
				where: {
					and: [
						{ shop: { equals: resellerShopId } },
						{ product: { equals: input.productId } },
					],
				},
				limit: 1,
				pagination: false,
				depth: 0,
				overrideAccess: true,
				req,
			});
			if (existingListing.docs[0]) {
				throw new ServiceError(ERROR_CODES.resaleAlreadyReselling, 409);
			}

			const linkResult = await payload.find({
				collection: "resale-links",
				where: {
					and: [
						{ supplierShop: { equals: supplierShopId } },
						{ resellerShop: { equals: resellerShopId } },
					],
				},
				limit: 1,
				pagination: false,
				depth: 0,
				overrideAccess: true,
				req,
			});
			let link = linkResult.docs[0];
			if (link?.status !== "approved") {
				if (
					product.resale.approvalRequired === true ||
					link?.riskHold === true
				) {
					throw new ServiceError(ERROR_CODES.resaleLinkInactive, 409);
				}
				if (link && link.status !== "requested") {
					throw new ServiceError(ERROR_CODES.resaleLinkInactive, 409);
				}
				if (link) {
					link = await payload.update({
						collection: "resale-links",
						id: link.id,
						data: {
							status: "approved",
							decidedAt: new Date().toISOString(),
						},
						depth: 0,
						overrideAccess: true,
						req,
					});
				} else {
					const accepted = await payload.find({
						collection: "resale-terms-acceptances",
						where: {
							and: [
								{ shop: { equals: resellerShopId } },
								{ role: { equals: "reseller" } },
							],
						},
						sort: "-acceptedAt",
						limit: 1,
						pagination: false,
						depth: 0,
						overrideAccess: true,
						req,
					});
					const terms = accepted.docs[0];
					if (!terms) {
						throw new ServiceError(ERROR_CODES.resaleTermsNotAccepted, 409);
					}
					try {
						link = await payload.create({
							collection: "resale-links",
							data: {
								supplierShop: supplierShopId,
								resellerShop: resellerShopId,
								status: "approved",
								requestedBy: user.id,
								decidedAt: new Date().toISOString(),
								resellerTermsVersion: terms.version,
								resellerTermsAcceptedAt: terms.acceptedAt,
								riskHold: false,
							},
							depth: 0,
							overrideAccess: true,
							req,
						});
					} catch (error) {
						if (isUniqueViolation(error)) {
							throw new RetryTransaction(
								"another request created this supplier link first",
							);
						}
						throw error;
					}
				}
			}
			if (!link) throw new ServiceError(ERROR_CODES.resaleLinkInactive, 409);

			const variantResult = await payload.find({
				collection: "product-variants",
				where: {
					and: [
						{ product: { equals: input.productId } },
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
			if (
				variants.length === 0 ||
				input.prices.length !== variants.length ||
				new Set(input.prices.map((row) => row.variantId)).size !==
					variants.length
			) {
				throw new ServiceError(ERROR_CODES.resaleInvalidPricing, 400);
			}
			const categoryId = relationId(product.category);
			if (!categoryId) throw new ServiceError(ERROR_CODES.validation, 400);
			const priceByVariant = new Map(
				input.prices.map(({ variantId, price }) => [variantId, price]),
			);
			for (const variant of variants) {
				const variantId = String(variant.id);
				const price = priceByVariant.get(variantId);
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

			const supplierListing = await payload.find({
				collection: "listings",
				where: {
					and: [
						{ shop: { equals: supplierShopId } },
						{ product: { equals: input.productId } },
						{ status: { equals: "published" } },
					],
				},
				limit: 1,
				pagination: false,
				depth: 0,
				overrideAccess: true,
				req,
			});
			const derived = deriveListingData(product, variants, reseller);
			const prices = variants.map((variant) => ({
				variant: String(variant.id),
				price: priceByVariant.get(String(variant.id)) ?? 0,
			}));
			const resellerPrices = prices.map((row) => row.price);
			const minimumPrice = Math.min(...resellerPrices);
			const maximumPrice = Math.max(...resellerPrices);
			const status =
				input.desiredStatus === "published" &&
				supplierListing.docs.length > 0 &&
				derived.productSummary.available !== false
					? "published"
					: "draft";
			try {
				return await payload.create({
					collection: "listings",
					data: {
						...derived,
						category: categoryId,
						price: minimumPrice,
						productSummary: {
							...derived.productSummary,
							priceMin: minimumPrice,
							priceMax: maximumPrice,
						},
						seller: user.id,
						status,
						moderationHold: false,
						expiresAt: null,
						resale: {
							supplierShop: supplierShopId,
							link: link.id,
							prices,
							desiredStatus: input.desiredStatus,
							holds:
								input.desiredStatus === "published" &&
								(supplierListing.docs.length === 0 ||
									derived.productSummary.available === false)
									? [
											supplierListing.docs.length === 0
												? "product_unavailable"
												: "supplier_unavailable",
										]
									: [],
						},
					},
					depth: 0,
					overrideAccess: true,
					context: { resaleService: true, productService: true },
					req,
				});
			} catch (error) {
				if (isUniqueViolation(error)) {
					throw new RetryTransaction(
						"another request created this shop's resale listing first",
					);
				}
				throw error;
			}
		},
		{ user, context: { resaleService: true } },
	);
}
