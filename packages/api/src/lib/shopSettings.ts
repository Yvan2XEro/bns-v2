import type { Payload } from "payload";

export interface ShopSettings {
	enabled: boolean;
	maxPerUser: number;
}

/** Fails closed: an unreadable settings global means shops stay off. */
export async function getShopSettings(payload: Payload): Promise<ShopSettings> {
	try {
		const settings = await payload.findGlobal({
			slug: "app-settings",
			depth: 0,
			overrideAccess: true,
		});
		const shops = (
			settings as { shops?: { enabled?: boolean; maxPerUser?: number } }
		).shops;
		const max = Number(shops?.maxPerUser);
		return {
			enabled: shops?.enabled === true,
			maxPerUser: Number.isInteger(max) && max > 0 ? max : 1,
		};
	} catch {
		return { enabled: false, maxPerUser: 1 };
	}
}
