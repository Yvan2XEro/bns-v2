import { useQueryClient } from "@tanstack/react-query";
import { router } from "expo-router";
import { useEffect } from "react";
import { useAlert } from "../contexts/AlertContext";
import { useChatClient } from "../contexts/ChatContext";
import { useTranslation } from "../lib/i18n";
import { shopKeys } from "./useShops";

/**
 * Mobile's twin of web's shop-inbox socket wiring: joins `shop-inbox:{shopId}`
 * for the active shop, invalidates the inbox query on anything that changes
 * what it should show, and treats `shop:access-revoked` as a security event
 * rather than a notification — the caller has just been removed or
 * suspended, so the seller screens must not stay open polling a shop's buyer
 * conversations on their behalf.
 *
 * A subscription to the socket, not a data loader: it never fetches, it only
 * tells TanStack Query what to refetch.
 */
export function useShopInboxSocket(shopId: string | null): void {
	const { chatClient } = useChatClient();
	const queryClient = useQueryClient();
	const { showWarning } = useAlert();
	const { t } = useTranslation();

	useEffect(() => {
		if (!chatClient || !shopId) return;

		chatClient.joinShopInbox(shopId);

		const invalidateInbox = () => {
			queryClient.invalidateQueries({ queryKey: shopKeys.inboxRoot(shopId) });
			queryClient.invalidateQueries({ queryKey: shopKeys.myShops });
		};

		const onAccessRevoked = (payload: { shopId: string }) => {
			if (payload.shopId !== shopId) return;
			showWarning(t("inbox.accessRevokedTitle"), t("inbox.accessRevokedBody"));
			router.replace("/(tabs)/account");
		};

		chatClient.on("inbox:conversation-updated", invalidateInbox);
		chatClient.on("message:new", invalidateInbox);
		chatClient.on("shop:access-revoked", onAccessRevoked);

		return () => {
			chatClient.off("inbox:conversation-updated", invalidateInbox);
			chatClient.off("message:new", invalidateInbox);
			chatClient.off("shop:access-revoked", onAccessRevoked);
			chatClient.leaveShopInbox(shopId);
		};
	}, [chatClient, shopId, queryClient, showWarning, t]);
}
