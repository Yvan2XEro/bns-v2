import { router } from "expo-router";
import { useCallback } from "react";
import { Linking, Share } from "react-native";
import { useAppConfig } from "@/src/contexts/AppConfigContext";
import { useTranslation } from "@/src/lib/i18n";
import { type SellerHomeTarget, whatsappShareUrl } from "@/src/lib/sellerHome";
import { shopUrl } from "@/src/lib/shopHandle";

/**
 * WhatsApp first — where most buyers are reached — and the system share
 * sheet for everything else (or when WhatsApp cannot open).
 */
export function useSellerHomeActions(shop: { name: string; handle: string }) {
	const { t } = useTranslation();
	const { webUrl } = useAppConfig();
	const url = shopUrl(shop.handle, webUrl);
	const message = t("sellerHome.shareMessage", { shop: shop.name, url });

	const shareAny = useCallback(() => {
		Share.share({ message, url }).catch(() => {
			// Dismissed or unavailable: nothing to recover.
		});
	}, [message, url]);

	const shareWhatsapp = useCallback(() => {
		Linking.openURL(whatsappShareUrl(message)).catch(shareAny);
	}, [message, shareAny]);

	const open = useCallback(
		(target: SellerHomeTarget) => {
			if (target.kind === "route") router.push(target.href);
			else if (target.kind === "share") shareWhatsapp();
		},
		[shareWhatsapp],
	);

	return { open, shareAny, shareWhatsapp };
}
