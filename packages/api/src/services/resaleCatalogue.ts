import type { Payload, Where } from "payload";
import type { ResaleCatalogueProduct } from "../contracts/resale";
import { ERROR_CODES } from "../lib/errors";
import { relationId } from "../lib/relationId";
import { getResaleSettings } from "../lib/resaleSettings";
import { ServiceError } from "../lib/serviceError";
import { shopCapabilities } from "../lib/shopCapabilities";
import type { Shop } from "../payload-types";
import { hasAcceptedCurrentResaleTerms } from "./resale";
import { requireShopPermission } from "./shopGuards";
import type { ServiceUser } from "./shops";

export async function listResaleCatalogue(
	payload: Payload,
	user: ServiceUser,
	resellerShopId: string,
	filters: {
		query?: string;
		categoryId?: string;
		supplierShopId?: string;
	} = {},
): Promise<{ products: ResaleCatalogueProduct[] }> {
	const settings = await getResaleSettings(payload);
	if (!settings.enabled)
		throw new ServiceError(ERROR_CODES.resaleDisabled, 404);
	const { shop: resellerShop } = await requireShopPermission(
		payload,
		user,
		resellerShopId,
		"resale.manage",
	);
	if (!shopCapabilities(resellerShop).resell) {
		throw new ServiceError(ERROR_CODES.resaleResellerNotEligible, 403);
	}
	if (
		!(await hasAcceptedCurrentResaleTerms(payload, resellerShopId, "reseller"))
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
		depth: 0,
		overrideAccess: true,
	});
	if (overdue.docs.length > 0) {
		throw new ServiceError(ERROR_CODES.resaleChargeOverdue, 409);
	}

	const productConditions: Where[] = [
		{ status: { equals: "active" } },
		{ "resale.enabled": { equals: true } },
		{ shop: { not_equals: resellerShopId } },
	];
	if (filters.categoryId) {
		productConditions.push({ category: { equals: filters.categoryId } });
	}
	if (filters.supplierShopId) {
		productConditions.push({ shop: { equals: filters.supplierShopId } });
	}
	if (filters.query) productConditions.push({ title: { like: filters.query } });
	const result = await payload.find({
		collection: "products",
		where: { and: productConditions },
		limit: 100,
		pagination: false,
		sort: "title",
		depth: 0,
		overrideAccess: true,
	});
	const supplierIds = [
		...new Set(
			result.docs
				.map((product) => relationId(product.shop))
				.filter((id): id is string => id !== null),
		),
	];
	const [shops, links] = await Promise.all([
		Promise.all(
			supplierIds.map((id) =>
				payload
					.findByID({ collection: "shops", id, depth: 0, overrideAccess: true })
					.catch(() => null),
			),
		),
		payload.find({
			collection: "resale-links",
			where: { resellerShop: { equals: resellerShopId } },
			limit: 0,
			pagination: false,
			depth: 0,
			overrideAccess: true,
		}),
	]);
	const suppliers = new Map<string, Shop>();
	for (const supplier of shops) {
		if (
			supplier &&
			supplier.status === "active" &&
			shopCapabilities(supplier).supplier
		) {
			suppliers.set(String(supplier.id), supplier);
		}
	}
	const linkBySupplier = new Map(
		links.docs.map((link) => [relationId(link.supplierShop), link] as const),
	);
	const resellerOwnerId = relationId(resellerShop.owner);
	const products: ResaleCatalogueProduct[] = [];
	for (const product of result.docs) {
		const supplierId = relationId(product.shop);
		const supplier = supplierId ? suppliers.get(supplierId) : undefined;
		if (
			!supplierId ||
			!supplier ||
			relationId(supplier.owner) === resellerOwnerId
		) {
			continue;
		}
		const link = linkBySupplier.get(supplierId) ?? null;
		const approvalRequired = product.resale?.approvalRequired === true;
		const canSeeSupplierPrice =
			!approvalRequired || link?.status === "approved";
		const variants = await payload.find({
			collection: "product-variants",
			where: {
				and: [
					{ product: { equals: String(product.id) } },
					{ "resale.enabled": { equals: true } },
					{ archivedAt: { exists: false } },
				],
			},
			limit: 0,
			pagination: false,
			depth: 0,
			overrideAccess: true,
		});
		const mappedVariants = variants.docs.map((variant) => ({
			id: String(variant.id),
			sku: variant.sku ?? null,
			optionValues: variant.optionValues,
			minRetailPrice: variant.resale?.minRetailPrice ?? null,
			suggestedRetailPrice: variant.resale?.suggestedRetailPrice ?? null,
			...(canSeeSupplierPrice &&
			typeof variant.resale?.supplierPrice === "number"
				? { supplierPrice: variant.resale.supplierPrice }
				: {}),
		}));
		if (mappedVariants.length === 0) continue;
		products.push({
			productId: String(product.id),
			title: product.title,
			description: product.description ?? null,
			categoryId: relationId(product.category),
			images: product.images,
			supplier: {
				id: supplierId,
				name: supplier.name,
				level: shopCapabilities(supplier).effectiveLevel,
			},
			linkStatus: link?.status ?? null,
			approvalRequired,
			variants: mappedVariants,
		});
	}
	return { products };
}
