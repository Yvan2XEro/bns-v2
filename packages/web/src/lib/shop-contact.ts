import type { PublicShop } from "~/types";

export type ShopContactChannel =
	| { kind: "message" }
	| { kind: "whatsapp"; href: string }
	| { kind: "call"; href: string; phone: string };

/**
 * The shop page's "Contacter" menu, in order: writing in the app is always
 * offered, the business channels only when the shop filled them.
 */
export function shopContactChannels(
	contact: PublicShop["contact"],
): ShopContactChannel[] {
	const channels: ShopContactChannel[] = [{ kind: "message" }];
	if (contact.whatsapp) {
		channels.push({
			kind: "whatsapp",
			href: `https://wa.me/${contact.whatsapp.replace(/[^\d]/g, "")}`,
		});
	}
	if (contact.phone) {
		channels.push({
			kind: "call",
			href: `tel:${contact.phone.replace(/\s/g, "")}`,
			phone: contact.phone,
		});
	}
	return channels;
}
