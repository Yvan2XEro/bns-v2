import type { Payload } from "payload";
import { SHOP_SERVICE_CONTEXT } from "../collections/Shops";
import {
	medianHours,
	RESALE_STATS_WINDOW_DAYS,
	type SupplierResaleStats,
} from "../contracts/resale";
import { relationId } from "../lib/relationId";
import { shopCapabilities } from "../lib/shopCapabilities";
import { withTransaction } from "../lib/transactions";
import type { PurchaseOrder, ResaleLink, Shop } from "../payload-types";
import {
	getCurrentResaleTerms,
	hasAcceptedCurrentResaleTerms,
	syncResellerLevelHolds,
	updateResaleListingHold,
} from "./resale";

export async function enforceResaleTerms(
	payload: Payload,
	now = new Date(),
): Promise<string[]> {
	const heldShops: string[] = [];
	for (const role of ["supplier", "reseller"] as const) {
		const terms = await getCurrentResaleTerms(payload, role, now);
		if (
			!terms?.requiresReacceptance ||
			!terms.enforceAt ||
			Date.parse(terms.enforceAt) > now.getTime()
		) {
			continue;
		}
		let page = 1;
		while (true) {
			const shops = await payload.find({
				collection: "shops",
				where: { status: { equals: "active" } },
				limit: 200,
				page,
				sort: "id",
				depth: 0,
				overrideAccess: true,
			});
			if (shops.docs.length === 0) break;
			for (const shop of shops.docs) {
				const capabilities = shopCapabilities(shop, now);
				if (
					(role === "supplier" && !capabilities.supplier) ||
					(role === "reseller" && !capabilities.resell)
				) {
					continue;
				}
				const shopId = String(shop.id);
				if (await hasAcceptedCurrentResaleTerms(payload, shopId, role))
					continue;
				const resaleListings = await payload.find({
					collection: "listings",
					where:
						role === "supplier"
							? { "resale.supplierShop": { equals: shopId } }
							: {
									and: [
										{ shop: { equals: shopId } },
										{ "resale.supplierShop": { exists: true } },
									],
								},
					limit: 1,
					depth: 0,
					overrideAccess: true,
				});
				if (resaleListings.docs.length === 0) continue;
				await withTransaction(payload, (req) =>
					updateResaleListingHold(
						req,
						shopId,
						role,
						"terms_not_accepted",
						"add",
					),
				);
				heldShops.push(`${role}:${shopId}`);
			}
			if (shops.docs.length < 200) break;
			page += 1;
		}
	}
	return heldShops;
}

function linkStatsFor(
	link: ResaleLink,
	listings: Array<{ resale?: { link?: unknown } | null }>,
	purchaseOrders: Array<{
		status?: string | null;
		return?: { reason?: string | null } | null;
	}>,
) {
	let deliveredOrders30d = 0;
	let cancelledPurchaseOrders30d = 0;
	let refusedDeliveries30d = 0;
	for (const purchaseOrder of purchaseOrders) {
		if (purchaseOrder.status === "delivered") deliveredOrders30d += 1;
		if (purchaseOrder.status === "cancelled") cancelledPurchaseOrders30d += 1;
		if (
			["refused", "unreachable", "absent", "address_not_found"].includes(
				purchaseOrder.return?.reason ?? "",
			)
		) {
			refusedDeliveries30d += 1;
		}
	}
	return {
		publishedListings: listings.filter(
			(listing) => relationId(listing.resale?.link) === String(link.id),
		).length,
		deliveredOrders30d,
		cancelledPurchaseOrders30d,
		refusedDeliveries30d,
	};
}

export async function refreshResaleLinkStats(
	payload: Payload,
	now = new Date(),
): Promise<{ linksUpdated: number; productsRepaired: number }> {
	let linksUpdated = 0;
	let page = 1;
	while (true) {
		const links = await payload.find({
			collection: "resale-links",
			limit: 200,
			page,
			sort: "id",
			depth: 0,
			overrideAccess: true,
		});
		if (links.docs.length === 0) break;
		for (const link of links.docs) {
			const linkId = String(link.id);
			const since = new Date(now.getTime() - 30 * 86_400_000).toISOString();
			const [listings, purchaseOrders] = await Promise.all([
				payload.find({
					collection: "listings",
					where: {
						and: [
							{ "resale.link": { equals: linkId } },
							{ status: { equals: "published" } },
						],
					},
					limit: 0,
					pagination: false,
					depth: 0,
					overrideAccess: true,
				}),
				payload.find({
					collection: "purchase-orders",
					where: {
						and: [
							{ link: { equals: linkId } },
							{ createdAt: { greater_than_equal: since } },
						],
					},
					limit: 0,
					pagination: false,
					depth: 0,
					overrideAccess: true,
				}),
			]);
			const stats = linkStatsFor(link, listings.docs, purchaseOrders.docs);
			if (
				link.stats?.publishedListings !== stats.publishedListings ||
				link.stats?.deliveredOrders30d !== stats.deliveredOrders30d ||
				link.stats?.cancelledPurchaseOrders30d !==
					stats.cancelledPurchaseOrders30d ||
				link.stats?.refusedDeliveries30d !== stats.refusedDeliveries30d
			) {
				await payload.update({
					collection: "resale-links",
					id: linkId,
					data: { stats },
					depth: 0,
					overrideAccess: true,
				});
				linksUpdated += 1;
			}
		}
		if (links.docs.length < 200) break;
		page += 1;
	}

	let productsRepaired = 0;
	page = 1;
	while (true) {
		const products = await payload.find({
			collection: "products",
			where: { "resale.enabled": { equals: true } },
			limit: 200,
			page,
			sort: "id",
			depth: 0,
			overrideAccess: true,
		});
		if (products.docs.length === 0) break;
		for (const product of products.docs) {
			const result = await payload.find({
				collection: "listings",
				where: {
					and: [
						{ product: { equals: String(product.id) } },
						{
							"resale.supplierShop": { equals: relationId(product.shop) ?? "" },
						},
					],
				},
				limit: 0,
				pagination: false,
				depth: 0,
				overrideAccess: true,
			});
			const resellerCount = new Set(
				result.docs.map((listing) => relationId(listing.shop)).filter(Boolean),
			).size;
			if (product.resale?.resellerCount === resellerCount) continue;
			await payload.update({
				collection: "products",
				id: String(product.id),
				data: { resale: { ...product.resale, resellerCount } },
				depth: 0,
				overrideAccess: true,
				context: { productService: true },
			});
			productsRepaired += 1;
		}
		if (products.docs.length < 200) break;
		page += 1;
	}
	return { linksUpdated, productsRepaired };
}

/**
 * A reseller's level can drop (expiry) or rise after it listed a product with
 * a minimum level; the supplier's edit only re-checks at the moment it saves.
 */
export async function enforceResellerLevelMinimums(
	payload: Payload,
	now = new Date(),
): Promise<number> {
	let changed = 0;
	let page = 1;
	while (true) {
		const products = await payload.find({
			collection: "products",
			where: { "resale.minResellerLevel": { exists: true } },
			limit: 200,
			page,
			sort: "id",
			depth: 0,
			overrideAccess: true,
		});
		if (products.docs.length === 0) break;
		for (const product of products.docs) {
			changed += await withTransaction(payload, (req) =>
				syncResellerLevelHolds(req, product, now),
			);
		}
		if (products.docs.length < 200) break;
		page += 1;
	}
	return changed;
}

export function supplierResaleStatsOf(
	shop: Pick<Shop, "resaleStats">,
): SupplierResaleStats {
	return {
		medianShipHours: shop.resaleStats?.medianShipHours ?? null,
		medianResponseHours: shop.resaleStats?.medianResponseHours ?? null,
	};
}

/** From the purchase order's creation to its first `shipped` status entry. */
export function shipDurationMs(
	purchaseOrder: Pick<PurchaseOrder, "createdAt" | "statusHistory">,
): number | null {
	const shipped = (purchaseOrder.statusHistory ?? []).find(
		(entry) => entry?.status === "shipped",
	);
	const start = Date.parse(purchaseOrder.createdAt);
	const end = shipped ? Date.parse(shipped.at) : Number.NaN;
	return Number.isFinite(start) && Number.isFinite(end) && end >= start
		? end - start
		: null;
}

/** From the reseller's latest request to the supplier's approval or refusal. */
export function responseDurationMs(
	link: Pick<
		ResaleLink,
		"createdAt" | "resellerTermsAcceptedAt" | "respondedAt"
	>,
): number | null {
	const start = Date.parse(link.resellerTermsAcceptedAt ?? link.createdAt);
	const end = link.respondedAt ? Date.parse(link.respondedAt) : Number.NaN;
	return Number.isFinite(start) && Number.isFinite(end) && end >= start
		? end - start
		: null;
}

async function eachPage<T>(
	load: (page: number) => Promise<{ docs: T[]; hasNextPage?: boolean }>,
	visit: (doc: T) => void,
): Promise<void> {
	for (let page = 1; ; page += 1) {
		const result = await load(page);
		for (const doc of result.docs) visit(doc);
		if (!result.hasNextPage || result.docs.length === 0) return;
	}
}

/**
 * Nightly: each supplier's median shipping time (purchase order created to
 * shipped) and usual response time to access requests, over the last
 * `RESALE_STATS_WINDOW_DAYS`. Stored on the supplier shop; shops whose
 * window emptied are reset to null.
 */
export async function refreshSupplierResaleStats(
	payload: Payload,
	now = new Date(),
): Promise<number> {
	const since = new Date(
		now.getTime() - RESALE_STATS_WINDOW_DAYS * 86_400_000,
	).toISOString();
	const ship = new Map<string, number[]>();
	const response = new Map<string, number[]>();
	const push = (map: Map<string, number[]>, key: string, value: number) =>
		map.set(key, [...(map.get(key) ?? []), value]);
	await eachPage(
		(page) =>
			payload.find({
				collection: "purchase-orders",
				where: {
					and: [
						{ createdAt: { greater_than_equal: since } },
						{ "statusHistory.status": { equals: "shipped" } },
					],
				},
				limit: 500,
				page,
				sort: "id",
				depth: 0,
				overrideAccess: true,
			}),
		(purchaseOrder) => {
			const supplierId = relationId(purchaseOrder.supplierShop);
			const duration = shipDurationMs(purchaseOrder);
			if (supplierId && duration !== null) push(ship, supplierId, duration);
		},
	);
	await eachPage(
		(page) =>
			payload.find({
				collection: "resale-links",
				where: { respondedAt: { greater_than_equal: since } },
				limit: 500,
				page,
				sort: "id",
				depth: 0,
				overrideAccess: true,
			}),
		(link) => {
			const supplierId = relationId(link.supplierShop);
			const duration = responseDurationMs(link);
			if (supplierId && duration !== null) push(response, supplierId, duration);
		},
	);
	const shopIds = new Set([...ship.keys(), ...response.keys()]);
	await eachPage(
		(page) =>
			payload.find({
				collection: "shops",
				where: { "resaleStats.computedAt": { exists: true } },
				limit: 500,
				page,
				sort: "id",
				depth: 0,
				overrideAccess: true,
			}),
		(shop) => {
			shopIds.add(String(shop.id));
		},
	);
	let updated = 0;
	for (const shopId of shopIds) {
		const shop = await payload
			.findByID({
				collection: "shops",
				id: shopId,
				depth: 0,
				overrideAccess: true,
			})
			.catch(() => null);
		if (!shop) continue;
		const next: SupplierResaleStats = {
			medianShipHours: medianHours(ship.get(shopId) ?? []),
			medianResponseHours: medianHours(response.get(shopId) ?? []),
		};
		const current = supplierResaleStatsOf(shop);
		const hadStats = Boolean(shop.resaleStats?.computedAt);
		if (
			hadStats &&
			current.medianShipHours === next.medianShipHours &&
			current.medianResponseHours === next.medianResponseHours
		)
			continue;
		if (
			!hadStats &&
			next.medianShipHours === null &&
			next.medianResponseHours === null
		)
			continue;
		await payload.update({
			collection: "shops",
			id: shopId,
			data: { resaleStats: { ...next, computedAt: now.toISOString() } },
			depth: 0,
			overrideAccess: true,
			context: SHOP_SERVICE_CONTEXT,
		});
		updated += 1;
	}
	return updated;
}
