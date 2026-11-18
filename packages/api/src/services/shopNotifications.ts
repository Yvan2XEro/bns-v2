import type { Payload } from "payload";
import { relationId } from "../lib/relationId";
import type { Shop } from "../payload-types";
import { isNotificationProviderConfigured } from "./notificationProvider";

type Value = string | number | boolean | null;
type ShopRef = Pick<Shop, "id" | "handle" | "name" | "owner">;

const webUrl = () => process.env.PUBLIC_WEB_URL ?? "https://buynsellem.com";

async function trigger(
	event: string,
	subscriberId: string | null,
	payload: Record<string, Value>,
) {
	if (!subscriberId || !isNotificationProviderConfigured()) return;
	const { triggerNotificationEvent } = await import(
		"../hooks/notificationEvents"
	);
	await triggerNotificationEvent({ event, subscriberId, payload });
}

export async function notifyShopCreated(shop: ShopRef) {
	await trigger("shop-created", relationId(shop.owner), {
		shopId: String(shop.id),
		shopName: String(shop.name ?? ""),
		handle: String(shop.handle ?? ""),
		shopUrl: `${webUrl()}/s/${String(shop.handle ?? "")}`,
	});
}

export async function notifyShopSuspended(
	shop: ShopRef,
	until: string | null,
	reason: string,
) {
	await trigger("shop-suspended", relationId(shop.owner), {
		shopId: String(shop.id),
		shopName: String(shop.name ?? ""),
		reason,
		until: until ?? "",
	});
}

export async function notifyShopUnsuspended(shop: ShopRef) {
	await trigger("shop-unsuspended", relationId(shop.owner), {
		shopId: String(shop.id),
		shopName: String(shop.name ?? ""),
	});
}

/** Owners and managers only: P3 staff do not see costs or restock. */
export async function notifyStockLow(
	payload: Payload,
	alert: {
		shopId: string;
		productId: string;
		productTitle: string;
		variantLabel: string;
		available: number;
	},
) {
	const members = await payload.find({
		collection: "shop-members",
		where: {
			and: [
				{ shop: { equals: alert.shopId } },
				{ status: { equals: "active" } },
				{ role: { in: ["owner", "manager"] } },
			],
		},
		depth: 0,
		limit: 0,
		pagination: false,
		overrideAccess: true,
	});
	for (const member of members.docs) {
		await trigger("stock-low", relationId(member.user), { ...alert });
	}
}
