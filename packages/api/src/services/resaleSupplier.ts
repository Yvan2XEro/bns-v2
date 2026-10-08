import type { Payload } from "payload";
import type { SupplierResaleProduct } from "../contracts/resale";
import { ERROR_CODES } from "../lib/errors";
import { relationId } from "../lib/relationId";
import { getResaleSettings } from "../lib/resaleSettings";
import { ServiceError } from "../lib/serviceError";
import { shopCapabilities } from "../lib/shopCapabilities";
import { withTransaction } from "../lib/transactions";
import type {
	ProductVariant,
} from "../payload-types";
import {
	hasAcceptedCurrentResaleTerms,
	updateResaleListingHold,
} from "./resale";
import { requireShopPermission } from "./shopGuards";
import type { ServiceUser } from "./shops";

export interface SupplierResaleSettingsInput {
	enabled: boolean;
	approvalRequired: boolean;
	handlingHours: number;
	codAccepted: boolean;
	resellerNotes: string;
	variants: Array<{
		id: string;
		enabled: boolean;
		supplierPrice: number;
		minRetailPrice: number;
		suggestedRetailPrice: number;
	}>;
}

const PRICE_CHANGE_DELAY_MS = 48 * 60 * 60 * 1000;

export async function listSupplierResaleProducts(
	payload: Payload,
	user: ServiceUser,
	shopId: string,
	now = new Date(),
): Promise<SupplierResaleProduct[]> {
	const settings = await getResaleSettings(payload);
	if (!settings.enabled)
		throw new ServiceError(ERROR_CODES.resaleDisabled, 404);
	const { shop } = await requireShopPermission(
		payload,
		user,
		shopId,
		"resale.manage",
	);
	if (!shopCapabilities(shop, now).supplier) {
		throw new ServiceError(ERROR_CODES.resaleSupplierNotEligible, 403);
	}
	if (!(await hasAcceptedCurrentResaleTerms(payload, shopId, "supplier"))) {
		throw new ServiceError(ERROR_CODES.resaleTermsNotAccepted, 409);
	}
	const productsResult = await payload.find({
		collection: "products",
		where: {
			and: [
				{ shop: { equals: shopId } },
				{ "resale.enabled": { equals: true } },
			],
		},
		limit: 0,
		pagination: false,
		depth: 0,
		overrideAccess: true,
	});
	const products = productsResult.docs;
	const productIds = products.map((product) => String(product.id));
	if (productIds.length === 0) return [];
	const [variantsResult, listingsResult, ordersResult] = await Promise.all([
		payload.find({
			collection: "product-variants",
			where: {
				and: [
					{ product: { in: productIds } },
					{ "resale.enabled": { equals: true } },
					{ archivedAt: { exists: false } },
				],
			},
			limit: 0,
			pagination: false,
			depth: 0,
			overrideAccess: true,
		}),
		payload.find({
			collection: "listings",
			where: { "resale.supplierShop": { equals: shopId } },
			limit: 0,
			pagination: false,
			depth: 0,
			overrideAccess: true,
		}),
		payload.find({
			collection: "purchase-orders",
			where: {
				and: [
					{ supplierShop: { equals: shopId } },
					{ status: { equals: "delivered" } },
				],
			},
			limit: 0,
			pagination: false,
			depth: 0,
			overrideAccess: true,
		}),
	]);
	const variants = variantsResult.docs;
	const listings = listingsResult.docs;
	const orders = ordersResult.docs;
	const since = now.getTime() - 30 * 24 * 60 * 60 * 1000;
	return products.map((product) => {
		const variantsForProduct = variants.filter(
			(variant) => relationId(variant.product) === String(product.id),
		);
		const variantIds = new Set(
			variantsForProduct.map((variant) => String(variant.id)),
		);
		const resellerPrices = new Map<string, number[]>();
		for (const listing of listings) {
			if (relationId(listing.product) !== String(product.id)) continue;
			for (const price of listing.resale?.prices ?? []) {
				const variantId = relationId(price.variant);
				if (!variantId || !variantIds.has(variantId)) continue;
				const prices = resellerPrices.get(variantId) ?? [];
				prices.push(price.price);
				resellerPrices.set(variantId, prices);
			}
		}
		const unitsDelivered30d = orders.reduce((total, order) => {
			const deliveredAt = [...(order.statusHistory ?? [])]
				.reverse()
				.find((event) => event.status === "delivered")?.at;
			if (!deliveredAt || Date.parse(deliveredAt) < since) return total;
			return (
				total +
				order.items.reduce(
					(orderTotal, item) =>
						variantIds.has(relationId(item.variant) ?? "")
							? orderTotal + item.quantity
							: orderTotal,
					0,
				)
			);
		}, 0);
		return {
			productId: String(product.id),
			title: product.title,
			enabled: product.resale?.enabled === true,
			resellerCount: product.resale?.resellerCount ?? 0,
			unitsDelivered30d,
			pendingEffectiveAt: product.resale?.pendingChange?.effectiveAt ?? null,
			variants: variantsForProduct.map((variant) => ({
				id: String(variant.id),
				sku: variant.sku ?? null,
				supplierPrice: variant.resale?.supplierPrice ?? null,
				minRetailPrice: variant.resale?.minRetailPrice ?? null,
				suggestedRetailPrice: variant.resale?.suggestedRetailPrice ?? null,
				resellerPrices: resellerPrices.get(String(variant.id)) ?? [],
			})),
		};
	});
}

export async function updateSupplierResaleSettings(
	payload: Payload,
	user: ServiceUser,
	productId: string,
	input: SupplierResaleSettingsInput,
	now = new Date(),
): Promise<void> {
	const settings = await getResaleSettings(payload);
	if (!settings.enabled)
		throw new ServiceError(ERROR_CODES.resaleDisabled, 403);
	await withTransaction(
		payload,
		async (req) => {
			const product = await req.payload.findByID({
				collection: "products",
				id: productId,
				depth: 0,
				overrideAccess: true,
				req,
			});
			const shopId = relationId(product.shop);
			if (!shopId) throw new ServiceError(ERROR_CODES.notFound, 404);
			const { shop } = await requireShopPermission(
				payload,
				user,
				shopId,
				"resale.manage",
				{ writable: true, req },
			);
			if (!shopCapabilities(shop, now).supplier) {
				throw new ServiceError(ERROR_CODES.resaleSupplierNotEligible, 403);
			}
			if (!(await hasAcceptedCurrentResaleTerms(payload, shopId, "supplier"))) {
				throw new ServiceError(ERROR_CODES.resaleTermsNotAccepted, 409);
			}
			const currentResult = await req.payload.find({
				collection: "product-variants",
				where: { product: { equals: productId } },
				limit: 0,
				pagination: false,
				depth: 0,
				overrideAccess: true,
				req,
			});
			const variants = new Map(
				currentResult.docs.map((variant) => [String(variant.id), variant]),
			);
			if (
				input.variants.length === 0 ||
				new Set(input.variants.map((variant) => variant.id)).size !==
					input.variants.length ||
				input.variants.some((variant) => !variants.has(variant.id))
			) {
				throw new ServiceError(ERROR_CODES.resaleInvalidPricing, 400);
			}
			const pendingById = new Map(
				(product.resale?.pendingChange?.variants ?? []).flatMap((row) => {
					const id = relationId(row.variant);
					return id ? [[id, row] as const] : [];
				}),
			);
			const nextPending = new Map(pendingById);
			let effectiveAt = product.resale?.pendingChange?.effectiveAt ?? null;
			for (const change of input.variants) {
				if (
					![
						change.supplierPrice,
						change.minRetailPrice,
						change.suggestedRetailPrice,
					].every((value) => Number.isSafeInteger(value) && value >= 0) ||
					change.supplierPrice < 1 ||
					change.minRetailPrice < change.supplierPrice ||
					change.suggestedRetailPrice < change.minRetailPrice
				) {
					throw new ServiceError(ERROR_CODES.resaleInvalidPricing, 400);
				}
				const current = variants.get(change.id) as ProductVariant;
				const currentResale = current.resale ?? {};
				const scheduled = pendingById.get(change.id);
				const baselineSupplier =
					scheduled?.supplierPrice ?? currentResale.supplierPrice ?? 0;
				const baselineMinimum =
					scheduled?.minRetailPrice ?? currentResale.minRetailPrice ?? 0;
				const deferred =
					change.supplierPrice > baselineSupplier ||
					change.minRetailPrice > baselineMinimum;
				if (deferred) {
					nextPending.set(change.id, {
						variant: change.id,
						supplierPrice: change.supplierPrice,
						minRetailPrice: change.minRetailPrice,
						suggestedRetailPrice: change.suggestedRetailPrice,
					});
					effectiveAt ??= new Date(
						now.getTime() + PRICE_CHANGE_DELAY_MS,
					).toISOString();
				} else {
					nextPending.delete(change.id);
				}
				const immediateSuggested = change.suggestedRetailPrice;
				await req.payload.update({
					collection: "product-variants",
					id: change.id,
					data: {
						resale: {
							...currentResale,
							enabled: change.enabled,
							...(deferred
								? {}
								: {
										supplierPrice: change.supplierPrice,
										minRetailPrice: change.minRetailPrice,
									}),
							suggestedRetailPrice: immediateSuggested,
						},
					},
					depth: 0,
					overrideAccess: true,
					context: { productService: true },
					req,
				});
			}
			const previousEnabled = product.resale?.enabled === true;
			if (nextPending.size === 0) effectiveAt = null;
			await req.payload.update({
				collection: "products",
				id: productId,
				data: {
					resale: {
						...product.resale,
						enabled: input.enabled,
						approvalRequired: input.approvalRequired,
						handlingHours: input.handlingHours,
						codAccepted: input.codAccepted,
						resellerNotes: input.resellerNotes,
						enabledAt:
							input.enabled && !previousEnabled
								? now.toISOString()
								: (product.resale?.enabledAt ?? undefined),
						pendingChange: {
							effectiveAt,
							variants: [...nextPending.values()],
						},
					},
				},
				depth: 0,
				overrideAccess: true,
				context: { productService: true, resaleService: true },
				req,
			});
			if (previousEnabled !== input.enabled) {
				await updateResaleListingHold(
					req,
					shopId,
					"supplier",
					"product_unavailable",
					input.enabled ? "remove" : "add",
					undefined,
					productId,
				);
			}
		},
		{ user, context: { productService: true, resaleService: true } },
	);
}

export async function applyResalePriceChanges(
	payload: Payload,
	now = new Date(),
): Promise<string[]> {
	const due = await payload.find({
		collection: "products",
		where: {
			"resale.pendingChange.effectiveAt": {
				less_than_equal: now.toISOString(),
			},
		},
		limit: 200,
		pagination: false,
		depth: 0,
		overrideAccess: true,
	});
	const applied: string[] = [];
	for (const candidate of due.docs) {
		const productId = String(candidate.id);
		await withTransaction(payload, async (req) => {
			const product = await req.payload.findByID({
				collection: "products",
				id: productId,
				depth: 0,
				overrideAccess: true,
				req,
			});
			const pending = product.resale?.pendingChange;
			if (
				!pending?.effectiveAt ||
				Date.parse(pending.effectiveAt) > now.getTime() ||
				!pending.variants?.length
			) {
				return;
			}
			const minimumByVariant = new Map<string, number>();
			for (const row of pending.variants) {
				const variantId = relationId(row.variant);
				if (!variantId) continue;
				const variant = await req.payload.findByID({
					collection: "product-variants",
					id: variantId,
					depth: 0,
					overrideAccess: true,
					req,
				});
				await req.payload.update({
					collection: "product-variants",
					id: variantId,
					data: {
						resale: {
							...variant.resale,
							...(typeof row.supplierPrice === "number"
								? { supplierPrice: row.supplierPrice }
								: {}),
							...(typeof row.minRetailPrice === "number"
								? { minRetailPrice: row.minRetailPrice }
								: {}),
							...(typeof row.suggestedRetailPrice === "number"
								? { suggestedRetailPrice: row.suggestedRetailPrice }
								: {}),
						},
					},
					depth: 0,
					overrideAccess: true,
					context: { productService: true },
					req,
				});
				if (typeof row.minRetailPrice === "number") {
					minimumByVariant.set(variantId, row.minRetailPrice);
				}
			}
			await req.payload.update({
				collection: "products",
				id: productId,
				data: {
					resale: {
						...product.resale,
						pendingChange: { effectiveAt: null, variants: [] },
					},
				},
				depth: 0,
				overrideAccess: true,
				context: { productService: true, resaleService: true },
				req,
			});
			const listings = await req.payload.find({
				collection: "listings",
				where: {
					and: [
						{ product: { equals: productId } },
						{
							"resale.supplierShop": { equals: relationId(product.shop) ?? "" },
						},
					],
				},
				limit: 0,
				pagination: false,
				depth: 0,
				overrideAccess: true,
				req,
			});
			for (const listing of listings.docs) {
				const belowMinimum = (listing.resale?.prices ?? []).some((price) => {
					const variantId = relationId(price.variant);
					const minimum = variantId
						? minimumByVariant.get(variantId)
						: undefined;
					return minimum !== undefined && price.price < minimum;
				});
				if (belowMinimum) {
					const holds = [
						...new Set([
							...(listing.resale?.holds ?? []),
							"price_below_minimum" as const,
						]),
					];
					await req.payload.update({
						collection: "listings",
						id: String(listing.id),
						data: {
							status: "draft",
							resale: {
								...listing.resale,
								holds,
							},
						},
						depth: 0,
						overrideAccess: true,
						context: { resaleService: true },
						req,
					});
				}
			}
		});
		applied.push(productId);
	}
	return applied;
}
