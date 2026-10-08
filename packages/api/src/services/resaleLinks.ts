import type { Payload, PayloadRequest } from "payload";
import { isModerator } from "../access/roles";
import type {
	ResaleLinkListItem,
	ResaleLinkListPage,
} from "../contracts/resale";
import { ERROR_CODES } from "../lib/errors";
import { relationId } from "../lib/relationId";
import { getResaleSettings } from "../lib/resaleSettings";
import { ServiceError } from "../lib/serviceError";
import { shopCapabilities } from "../lib/shopCapabilities";
import {
	commitContextOf,
	onCommit,
	withTransaction,
} from "../lib/transactions";
import type { ResaleLink } from "../payload-types";
import {
	hasAcceptedCurrentResaleTerms,
	updateResaleListingHold,
} from "./resale";
import {
	notifyResaleLinkDecided,
	notifyResaleLinkRequested,
	notifyResaleLinkSuspended,
} from "./resaleNotifications";
import { requireShopPermission } from "./shopGuards";
import type { ServiceUser } from "./shops";

export interface RequestResaleLinkInput {
	supplierShop: string;
	message?: string;
	acceptTermsVersion: string;
}

export interface DecideResaleLinkInput {
	action: "approve" | "decline" | "suspend" | "reinstate" | "revoke";
	reason?: "quality" | "pricing" | "fraud_review" | "terms" | "other";
	note?: string;
}

export interface ListResaleLinksInput {
	side: "supplier" | "reseller";
	status?: "requested" | "approved" | "suspended" | "revoked";
}

function identitiesFor(
	shopOwner: unknown,
	activeMembers: unknown[],
): Set<string> {
	const identities = new Set<string>();
	const ownerId = relationId(shopOwner);
	if (ownerId) identities.add(ownerId);
	for (const member of activeMembers) {
		if (typeof member !== "object" || member === null || !("user" in member))
			continue;
		const userId = relationId(member.user);
		if (userId) identities.add(userId);
	}
	return identities;
}

export async function sharesActiveResaleIdentity(
	req: PayloadRequest,
	supplierShop: { id: string; owner?: unknown },
	resellerShop: { id: string; owner?: unknown },
): Promise<boolean> {
	const [supplierMembers, resellerMembers] = await Promise.all([
		req.payload.find({
			collection: "shop-members",
			where: {
				and: [
					{ shop: { equals: supplierShop.id } },
					{ status: { equals: "active" } },
				],
			},
			limit: 0,
			pagination: false,
			depth: 0,
			overrideAccess: true,
			req,
		}),
		req.payload.find({
			collection: "shop-members",
			where: {
				and: [
					{ shop: { equals: resellerShop.id } },
					{ status: { equals: "active" } },
				],
			},
			limit: 0,
			pagination: false,
			depth: 0,
			overrideAccess: true,
			req,
		}),
	]);
	const supplierIdentities = identitiesFor(
		supplierShop.owner,
		supplierMembers.docs,
	);
	return [...identitiesFor(resellerShop.owner, resellerMembers.docs)].some(
		(identity) => supplierIdentities.has(identity),
	);
}

export async function requestResaleLink(
	payload: Payload,
	user: ServiceUser,
	resellerShopId: string,
	input: RequestResaleLinkInput,
	options: { now?: Date } = {},
): Promise<ResaleLink> {
	return withTransaction(
		payload,
		async (req) => {
			const now = options.now ?? new Date();
			const { shop: resellerShop } = await requireShopPermission(
				payload,
				user,
				resellerShopId,
				"resale.manage",
				{ writable: true, req },
			);
			const settings = await getResaleSettings(payload);
			if (!settings.enabled) {
				throw new ServiceError(ERROR_CODES.resaleDisabled, 404);
			}
			if (!shopCapabilities(resellerShop, now).resell) {
				throw new ServiceError(ERROR_CODES.resaleResellerNotEligible, 403);
			}
			const supplierShop = await payload
				.findByID({
					collection: "shops",
					id: input.supplierShop,
					depth: 0,
					overrideAccess: true,
					req,
				})
				.catch(() => null);
			if (!supplierShop || !shopCapabilities(supplierShop, now).supplier) {
				throw new ServiceError(ERROR_CODES.resaleSupplierNotEligible, 409);
			}
			if (
				supplierShop.id === resellerShop.id ||
				(await sharesActiveResaleIdentity(req, supplierShop, resellerShop))
			) {
				throw new ServiceError(ERROR_CODES.resaleOwnProduct, 409);
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
			const currentTerms = await payload.find({
				collection: "resale-terms",
				where: {
					and: [
						{ role: { equals: "reseller" } },
						{ version: { equals: input.acceptTermsVersion } },
						{ publishedAt: { less_than_equal: now.toISOString() } },
					],
				},
				limit: 1,
				pagination: false,
				depth: 0,
				overrideAccess: true,
				req,
			});
			if (!currentTerms.docs[0]) {
				throw new ServiceError(ERROR_CODES.resaleTermsNotAccepted, 409);
			}

			const existing = await payload.find({
				collection: "resale-links",
				where: {
					and: [
						{ supplierShop: { equals: supplierShop.id } },
						{ resellerShop: { equals: resellerShop.id } },
					],
				},
				limit: 1,
				pagination: false,
				depth: 0,
				overrideAccess: true,
				req,
			});
			const link = existing.docs[0];
			if (link?.status === "approved" || link?.status === "requested") {
				return link;
			}
			if (link?.status === "suspended") {
				throw new ServiceError(ERROR_CODES.resaleLinkInactive, 409);
			}
			if (link?.status === "revoked") {
				const revokedAt = link.revokedAt
					? Date.parse(link.revokedAt)
					: Number.NaN;
				const canReRequest =
					link.revokedBy === "supplier" &&
					Number.isFinite(revokedAt) &&
					now.getTime() - revokedAt >= 30 * 24 * 60 * 60 * 1000;
				if (!canReRequest) {
					throw new ServiceError(ERROR_CODES.resaleLinkInactive, 409);
				}
				const reRequested = await payload.update({
					collection: "resale-links",
					id: link.id,
					data: {
						status: "requested",
						requestedBy: user.id,
						message: input.message,
						resellerTermsVersion: currentTerms.docs[0].version,
						resellerTermsAcceptedAt: now.toISOString(),
						revokedAt: null,
						revokedBy: null,
					},
					depth: 0,
					overrideAccess: true,
					req,
				});
				const notify = () => notifyResaleLinkRequested(payload, reRequested);
				if (!onCommit(commitContextOf(req), notify)) await notify();
				return reRequested;
			}

			const created = await payload.create({
				collection: "resale-links",
				data: {
					supplierShop: supplierShop.id,
					resellerShop: resellerShop.id,
					status: "requested",
					requestedBy: user.id,
					message: input.message,
					resellerTermsVersion: currentTerms.docs[0].version,
					resellerTermsAcceptedAt: now.toISOString(),
					riskHold: false,
				},
				depth: 0,
				overrideAccess: true,
				req,
			});
			const notify = () => notifyResaleLinkRequested(payload, created);
			if (!onCommit(commitContextOf(req), notify)) await notify();
			return created;
		},
		{ user, context: { resaleService: true } },
	);
}

export async function decideResaleLink(
	payload: Payload,
	user: ServiceUser,
	linkId: string,
	input: DecideResaleLinkInput,
	options: { now?: Date } = {},
): Promise<ResaleLink> {
	return withTransaction(
		payload,
		async (req) => {
			const link = await payload
				.findByID({
					collection: "resale-links",
					id: linkId,
					depth: 0,
					overrideAccess: true,
					req,
				})
				.catch(() => null);
			if (!link) {
				throw new ServiceError(ERROR_CODES.resaleLinkInactive, 404);
			}
			const now = (options.now ?? new Date()).toISOString();
			const moderator = isModerator(user);
			const supplierShopId = relationId(link.supplierShop);
			const resellerShopId = relationId(link.resellerShop);
			if (!supplierShopId || !resellerShopId) {
				throw new ServiceError(ERROR_CODES.resaleLinkInactive, 409);
			}
			if (!moderator) {
				await requireShopPermission(
					payload,
					user,
					supplierShopId,
					"resale.manage",
					{ writable: true, req },
				);
			}

			let data: Partial<ResaleLink>;
			switch (input.action) {
				case "approve":
					if (link.status !== "requested" || (link.riskHold && !moderator)) {
						throw new ServiceError(ERROR_CODES.resaleLinkInactive, 409);
					}
					data = {
						status: "approved",
						decidedBy: user.id,
						decidedAt: now,
						suspendedBy: null,
						suspendedReason: null,
						note: input.note,
					};
					break;
				case "decline":
					if (link.status !== "requested") {
						throw new ServiceError(ERROR_CODES.resaleLinkInactive, 409);
					}
					data = {
						status: "revoked",
						decidedBy: user.id,
						decidedAt: now,
						revokedAt: now,
						revokedBy: moderator ? "moderator" : "supplier",
						note: input.note,
					};
					break;
				case "suspend":
					if (link.status !== "approved" || !input.reason) {
						throw new ServiceError(ERROR_CODES.resaleLinkInactive, 409);
					}
					data = {
						status: "suspended",
						decidedBy: user.id,
						decidedAt: now,
						suspendedBy: moderator ? "moderator" : "supplier",
						suspendedReason: input.reason,
						note: input.note,
					};
					break;
				case "reinstate":
					if (
						link.status !== "suspended" ||
						(!moderator && link.suspendedBy !== "supplier")
					) {
						throw new ServiceError(ERROR_CODES.resaleLinkInactive, 409);
					}
					data = {
						status: "approved",
						decidedBy: user.id,
						decidedAt: now,
						suspendedBy: null,
						suspendedReason: null,
						note: input.note,
					};
					break;
				case "revoke":
					if (link.status !== "approved" && link.status !== "suspended") {
						throw new ServiceError(ERROR_CODES.resaleLinkInactive, 409);
					}
					data = {
						status: "revoked",
						decidedBy: user.id,
						decidedAt: now,
						revokedAt: now,
						revokedBy: moderator ? "moderator" : "supplier",
						note: input.note,
					};
					break;
			}

			const updated = await payload.update({
				collection: "resale-links",
				id: link.id,
				data,
				depth: 0,
				overrideAccess: true,
				req,
			});
			if (input.action === "suspend" || input.action === "revoke") {
				await updateResaleListingHold(
					req,
					resellerShopId,
					"reseller",
					"link_inactive",
					"add",
					supplierShopId,
				);
			}
			if (input.action === "reinstate") {
				await updateResaleListingHold(
					req,
					resellerShopId,
					"reseller",
					"link_inactive",
					"remove",
					supplierShopId,
				);
			}
			const notify = () => {
				if (input.action === "approve" || input.action === "decline") {
					return notifyResaleLinkDecided(
						payload,
						updated,
						input.action === "approve" ? "approved" : "declined",
					);
				}
				if (input.action === "suspend" || input.action === "revoke") {
					return notifyResaleLinkSuspended(
						payload,
						updated,
						input.action === "suspend" ? "suspended" : "revoked",
						input.reason ?? link.suspendedReason,
					);
				}
				return notifyResaleLinkDecided(payload, updated, "approved");
			};
			if (!onCommit(commitContextOf(req), notify)) await notify();
			return updated;
		},
		{ user, context: { resaleService: true } },
	);
}

export async function listResaleLinks(
	payload: Payload,
	user: ServiceUser,
	shopId: string,
	input: ListResaleLinksInput,
): Promise<ResaleLinkListPage> {
	await requireShopPermission(payload, user, shopId, "resale.manage");
	const sideField = input.side === "supplier" ? "supplierShop" : "resellerShop";
	const result = await payload.find({
		collection: "resale-links",
		where: {
			and: [
				{ [sideField]: { equals: shopId } },
				...(input.status ? [{ status: { equals: input.status } }] : []),
			],
		},
		sort: "-updatedAt",
		limit: 100,
		depth: 0,
		overrideAccess: true,
	});
	const partnerIds = [
		...new Set(
			result.docs
				.map((link) =>
					relationId(
						input.side === "supplier" ? link.resellerShop : link.supplierShop,
					),
				)
				.filter((id): id is string => id !== null),
		),
	];
	const linkIds = result.docs.map((link) => String(link.id));
	const [partners, listings, purchaseOrders] = await Promise.all([
		partnerIds.length > 0
			? payload.find({
					collection: "shops",
					where: { id: { in: partnerIds } },
					limit: 0,
					pagination: false,
					depth: 0,
					overrideAccess: true,
				})
			: Promise.resolve({ docs: [] }),
		linkIds.length > 0
			? payload.find({
					collection: "listings",
					where: {
						and: [
							{ "resale.link": { in: linkIds } },
							{ status: { equals: "published" } },
						],
					},
					limit: 0,
					pagination: false,
					depth: 0,
					overrideAccess: true,
				})
			: Promise.resolve({ docs: [] }),
		linkIds.length > 0
			? payload.find({
					collection: "purchase-orders",
					where: {
						and: [
							{ link: { in: linkIds } },
							{
								createdAt: {
									greater_than_equal: new Date(
										Date.now() - 30 * 86_400_000,
									).toISOString(),
								},
							},
						],
					},
					limit: 0,
					pagination: false,
					depth: 0,
					overrideAccess: true,
				})
			: Promise.resolve({ docs: [] }),
	]);
	const partnersById = new Map(
		partners.docs.map((partner) => [String(partner.id), partner]),
	);
	const stats = new Map<string, ResaleLinkListItem["stats"]>();
	for (const linkId of linkIds) {
		stats.set(linkId, {
			publishedListings: listings.docs.filter(
				(listing) => relationId(listing.resale?.link) === linkId,
			).length,
			deliveredOrders30d: 0,
			cancelledPurchaseOrders30d: 0,
			refusedDeliveries30d: 0,
		});
	}
	for (const purchaseOrder of purchaseOrders.docs) {
		const linkId = relationId(purchaseOrder.link);
		const linkStats = linkId ? stats.get(linkId) : undefined;
		if (!linkStats) continue;
		if (purchaseOrder.status === "delivered") linkStats.deliveredOrders30d += 1;
		if (purchaseOrder.status === "cancelled")
			linkStats.cancelledPurchaseOrders30d += 1;
		if (
			["refused", "unreachable", "absent", "address_not_found"].includes(
				purchaseOrder.return?.reason ?? "",
			)
		)
			linkStats.refusedDeliveries30d += 1;
	}
	const docs: ResaleLinkListItem[] = result.docs.flatMap((link) => {
		const partnerId = relationId(
			input.side === "supplier" ? link.resellerShop : link.supplierShop,
		);
		const partner = partnerId ? partnersById.get(partnerId) : undefined;
		const linkStats = stats.get(String(link.id));
		if (!partner || !linkStats) return [];
		return [
			{
				id: String(link.id),
				status: link.status,
				partnerShop: {
					id: String(partner.id),
					name: partner.name,
					handle: partner.handle ?? null,
				},
				message: link.message ?? null,
				requestedAt: link.createdAt ?? null,
				updatedAt: link.updatedAt ?? null,
				stats: linkStats,
			},
		];
	});
	return { docs, totalDocs: result.totalDocs };
}
