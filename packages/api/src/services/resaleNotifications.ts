import type { Payload } from "payload";
import { isSuspended } from "../access/roles";
import { can, resolveShopRole } from "../access/shopRoles";
import { triggerNotificationEvent } from "../hooks/notificationEvents";
import { relationId } from "../lib/relationId";
import type { ResaleLink } from "../payload-types";
import { isNotificationProviderConfigured } from "./notificationProvider";

async function resaleRecipients(
	payload: Payload,
	shopId: string | null,
): Promise<string[]> {
	if (!shopId || !isNotificationProviderConfigured()) return [];
	const shop = await payload
		.findByID({
			collection: "shops",
			id: shopId,
			depth: 0,
			overrideAccess: true,
		})
		.catch(() => null);
	if (!shop || shop.status !== "active") return [];

	const members = await payload.find({
		collection: "shop-members",
		where: {
			and: [{ shop: { equals: shopId } }, { status: { equals: "active" } }],
		},
		limit: 0,
		pagination: false,
		depth: 0,
		overrideAccess: true,
	});
	const roleContext: Record<string, unknown> = {};
	const recipientIds = new Set<string>();
	for (const member of members.docs) {
		const userId = relationId(member.user);
		if (!userId) continue;
		const role = await resolveShopRole(payload, userId, shopId, roleContext);
		if (!can(role, "resale.manage")) continue;
		const user = await payload
			.findByID({
				collection: "users",
				id: userId,
				depth: 0,
				overrideAccess: true,
			})
			.catch(() => null);
		if (user && !isSuspended(user)) recipientIds.add(userId);
	}
	return [...recipientIds];
}

async function shopName(
	payload: Payload,
	shopId: string | null,
): Promise<string> {
	if (!shopId) return "";
	const shop = await payload
		.findByID({
			collection: "shops",
			id: shopId,
			depth: 0,
			overrideAccess: true,
		})
		.catch(() => null);
	return typeof shop?.name === "string" ? shop.name : "";
}

async function notify(
	payload: Payload,
	event: string,
	shopId: string | null,
	linkId: string,
	otherShopName: string,
	fields: Record<string, string>,
): Promise<void> {
	const recipients = await resaleRecipients(payload, shopId);
	await Promise.all(
		recipients.map((subscriberId) =>
			triggerNotificationEvent({
				event,
				subscriberId,
				payload: { linkId, shopId, otherShopName, ...fields },
			}),
		),
	);
}

export async function notifyResaleLinkRequested(
	payload: Payload,
	link: ResaleLink,
): Promise<void> {
	const supplierShopId = relationId(link.supplierShop);
	const resellerShopId = relationId(link.resellerShop);
	await notify(
		payload,
		"resale-link-requested",
		supplierShopId,
		String(link.id),
		await shopName(payload, resellerShopId),
		{ message: link.message ?? "" },
	);
}

export async function notifyResaleLinkDecided(
	payload: Payload,
	link: ResaleLink,
	action: "approved" | "declined",
): Promise<void> {
	const supplierShopId = relationId(link.supplierShop);
	const resellerShopId = relationId(link.resellerShop);
	await notify(
		payload,
		"resale-link-decided",
		resellerShopId,
		String(link.id),
		await shopName(payload, supplierShopId),
		{ action },
	);
}

export async function notifyResaleLinkSuspended(
	payload: Payload,
	link: ResaleLink,
	action: "suspended" | "revoked",
	reason: string | null | undefined,
): Promise<void> {
	const supplierShopId = relationId(link.supplierShop);
	const resellerShopId = relationId(link.resellerShop);
	await notify(
		payload,
		"resale-link-suspended",
		resellerShopId,
		String(link.id),
		await shopName(payload, supplierShopId),
		{ action, reason: reason ?? "other" },
	);
}
