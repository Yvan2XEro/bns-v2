import type { Payload, PayloadRequest, Where } from "payload";
import { meetsMinResellerLevel } from "../contracts/resale";
import { ERROR_CODES } from "../lib/errors";
import { relationId } from "../lib/relationId";
import { ServiceError } from "../lib/serviceError";
import { shopCapabilities } from "../lib/shopCapabilities";
import { type TxReq, withTransaction } from "../lib/transactions";
import type { Listing, ResaleTerm } from "../payload-types";
import { requireShopPermission } from "./shopGuards";
import type { ServiceUser } from "./shops";

export type ResaleTermsRole = "supplier" | "reseller";

export interface AcceptResaleTermsInput {
	role: ResaleTermsRole;
	version: string;
	locale: "fr" | "en";
	client: "web" | "ios" | "android";
}

type ListingResaleHold = NonNullable<
	NonNullable<Listing["resale"]["holds"]>[number]
>;

export async function updateResaleListingHold(
	req: PayloadRequest,
	shopId: string,
	role: ResaleTermsRole,
	hold: ListingResaleHold,
	action: "add" | "remove",
	supplierShopId?: string,
	productId?: string,
): Promise<void> {
	const shopScope: Where =
		role === "supplier"
			? { "resale.supplierShop": { equals: shopId } }
			: { shop: { equals: shopId } };
	const supplierScope: Where | null =
		supplierShopId && role === "reseller"
			? { "resale.supplierShop": { equals: supplierShopId } }
			: null;
	const productScope: Where | null = productId
		? { product: { equals: productId } }
		: null;
	const matchingHold: Where =
		action === "remove"
			? { "resale.holds": { contains: hold } }
			: { "resale.supplierShop": { not_equals: null } };
	const where: Where = {
		and: [
			shopScope,
			...(supplierScope ? [supplierScope] : []),
			...(productScope ? [productScope] : []),
			matchingHold,
		],
	};
	const result = await req.payload.find({
		collection: "listings",
		where,
		limit: 0,
		pagination: false,
		depth: 0,
		overrideAccess: true,
		req,
	});

	for (const listing of result.docs) {
		if (!relationId(listing.resale?.supplierShop)) continue;
		const previousHolds = listing.resale.holds ?? [];
		const holds =
			action === "add"
				? previousHolds.includes(hold)
					? previousHolds
					: [...previousHolds, hold]
				: previousHolds.filter((existing) => existing !== hold);
		if (holds.length === previousHolds.length) continue;
		const supplierShopId = relationId(listing.resale.supplierShop);
		const productId = relationId(listing.product);
		let supplierListingIsPublished = false;
		if (action === "remove" && supplierShopId && productId) {
			const supplierListings = await req.payload.find({
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
			supplierListingIsPublished = supplierListings.docs.length > 0;
		}

		const status =
			action === "add"
				? "draft"
				: listing.resale.desiredStatus === "published" &&
						holds.length === 0 &&
						listing.moderationHold !== true &&
						supplierListingIsPublished
					? "published"
					: "draft";
		await req.payload.update({
			collection: "listings",
			id: listing.id,
			data: { status, resale: { ...listing.resale, holds } },
			depth: 0,
			overrideAccess: true,
			context: { resaleService: true, productService: true },
			req,
		});
	}
}

export async function syncSupplierProductAvailability(
	req: PayloadRequest,
	supplierShopId: string,
	productId: string,
	available: boolean,
): Promise<void> {
	await updateResaleListingHold(
		req,
		supplierShopId,
		"supplier",
		"supplier_unavailable",
		available ? "remove" : "add",
		undefined,
		productId,
	);
}

/**
 * Puts on hold, or releases, every reseller listing of a supplier product
 * against the product's minimum reseller level. Listings are never deleted:
 * a reseller who reaches the level, or a supplier who lowers it, gets them back.
 */
export async function syncResellerLevelHolds(
	req: PayloadRequest,
	product: { id: string | number; shop?: unknown; resale?: unknown },
	now = new Date(),
): Promise<number> {
	const productId = String(product.id);
	const supplierShopId = relationId(product.shop);
	if (!supplierShopId) return 0;
	const minimum =
		typeof product.resale === "object" && product.resale !== null
			? (product.resale as { minResellerLevel?: unknown }).minResellerLevel
			: undefined;
	const listings = await req.payload.find({
		collection: "listings",
		where: {
			and: [
				{ product: { equals: productId } },
				{ "resale.supplierShop": { equals: supplierShopId } },
			],
		},
		limit: 0,
		pagination: false,
		depth: 0,
		overrideAccess: true,
		req,
	});
	let changed = 0;
	const resellerIds = new Set(
		listings.docs
			.map((listing) => relationId(listing.shop))
			.filter((id): id is string => id !== null),
	);
	for (const resellerShopId of resellerIds) {
		const reseller = await req.payload
			.findByID({
				collection: "shops",
				id: resellerShopId,
				depth: 0,
				overrideAccess: true,
				req,
			})
			.catch(() => null);
		const allowed =
			reseller !== null &&
			meetsMinResellerLevel(
				shopCapabilities(reseller, now).effectiveLevel,
				minimum,
			);
		const held = listings.docs.some(
			(listing) =>
				relationId(listing.shop) === resellerShopId &&
				(listing.resale?.holds ?? []).includes("reseller_level_too_low"),
		);
		if (allowed !== held) continue;
		await updateResaleListingHold(
			req,
			resellerShopId,
			"reseller",
			"reseller_level_too_low",
			allowed ? "remove" : "add",
			supplierShopId,
			productId,
		);
		changed += 1;
	}
	return changed;
}

async function clearTermsHold(
	req: PayloadRequest,
	shopId: string,
	role: ResaleTermsRole,
): Promise<void> {
	await updateResaleListingHold(
		req,
		shopId,
		role,
		"terms_not_accepted",
		"remove",
	);
}

export async function holdResellerListingsForIneligibility(
	req: PayloadRequest,
	shopId: string,
): Promise<void> {
	await updateResaleListingHold(
		req,
		shopId,
		"reseller",
		"reseller_ineligible",
		"add",
	);
}

export async function clearResellerIneligibilityHold(
	req: PayloadRequest,
	shopId: string,
): Promise<void> {
	await updateResaleListingHold(
		req,
		shopId,
		"reseller",
		"reseller_ineligible",
		"remove",
	);
}

export async function getCurrentResaleTerms(
	payload: Payload,
	role: ResaleTermsRole,
	now = new Date(),
	req?: TxReq,
): Promise<ResaleTerm | null> {
	const result = await payload.find({
		collection: "resale-terms",
		where: {
			and: [
				{ role: { equals: role } },
				{ publishedAt: { less_than_equal: now.toISOString() } },
			],
		},
		sort: "-version",
		limit: 1,
		pagination: false,
		depth: 0,
		overrideAccess: true,
		req,
	});

	return result.docs[0] ?? null;
}

export async function hasAcceptedCurrentResaleTerms(
	payload: Payload,
	shopId: string,
	role: ResaleTermsRole,
	req?: TxReq,
): Promise<boolean> {
	const current = await getCurrentResaleTerms(payload, role, new Date(), req);
	if (!current) return false;
	const acceptances = await payload.find({
		collection: "resale-terms-acceptances",
		where: {
			and: [
				{ shop: { equals: shopId } },
				{ role: { equals: role } },
				{ version: { equals: current.version } },
			],
		},
		limit: 1,
		pagination: false,
		depth: 0,
		overrideAccess: true,
		req,
	});
	return acceptances.docs.length > 0;
}

export async function acceptResaleTerms(
	payload: Payload,
	user: ServiceUser,
	shopId: string,
	input: AcceptResaleTermsInput,
	options: { now?: Date } = {},
) {
	return withTransaction(
		payload,
		async (req) => {
			const { shop } = await requireShopPermission(
				payload,
				user,
				shopId,
				"resale.manage",
				{ writable: true, req },
			);
			const capabilities = shopCapabilities(shop, options.now);
			if (input.role === "supplier" && !capabilities.supplier) {
				throw new ServiceError(ERROR_CODES.resaleSupplierNotEligible, 403);
			}
			if (input.role === "reseller" && !capabilities.resell) {
				throw new ServiceError(ERROR_CODES.resaleResellerNotEligible, 403);
			}

			if (input.role === "reseller") {
				const overdueCharges = await payload.find({
					collection: "reseller-charges",
					where: {
						and: [
							{ resellerShop: { equals: shopId } },
							{ status: { equals: "overdue" } },
						],
					},
					limit: 1,
					pagination: false,
					depth: 0,
					overrideAccess: true,
					req,
				});
				if (overdueCharges.docs.length > 0) {
					throw new ServiceError(ERROR_CODES.resaleChargeOverdue, 409);
				}
			}

			const currentTerms = await getCurrentResaleTerms(payload, input.role);
			if (!currentTerms || currentTerms.version !== input.version) {
				throw new ServiceError(ERROR_CODES.resaleTermsNotAccepted, 409);
			}

			const existing = await payload.find({
				collection: "resale-terms-acceptances",
				where: {
					and: [
						{ shop: { equals: shopId } },
						{ role: { equals: input.role } },
						{ version: { equals: currentTerms.version } },
					],
				},
				limit: 1,
				pagination: false,
				depth: 0,
				overrideAccess: true,
				req,
			});
			const acceptance =
				existing.docs[0] ??
				(await payload.create({
					collection: "resale-terms-acceptances",
					data: {
						shop: shopId,
						role: input.role,
						terms: currentTerms.id,
						version: currentTerms.version,
						acceptedBy: user.id,
						acceptedAt: (options.now ?? new Date()).toISOString(),
						locale: input.locale,
						client: input.client,
					},
					depth: 0,
					overrideAccess: true,
					req,
				}));
			await clearTermsHold(req, shopId, input.role);
			return acceptance;
		},
		{ user, context: { resaleService: true } },
	);
}
