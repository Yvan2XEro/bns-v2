"use client";

import { useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useEffect } from "react";
import { toast } from "sonner";
import { useChatClient } from "~/hooks/use-chat-client";
import { inboxRootKey, myShopsKey } from "~/lib/query-keys";

/**
 * A subscription, which is what `useEffect` is for. It never loads data: every
 * event invalidates a query and lets TanStack Query do the fetching.
 */
export function useShopInboxSocket(shopId: string | null): void {
	const { chatClient } = useChatClient();
	const queryClient = useQueryClient();
	const router = useRouter();
	const t = useTranslations("Inbox");

	useEffect(() => {
		if (!chatClient || !shopId) return;

		void chatClient.joinShopInbox(shopId);

		const onUpdated = () => {
			queryClient.invalidateQueries({ queryKey: inboxRootKey(shopId) });
			queryClient.invalidateQueries({ queryKey: myShopsKey() });
		};
		const onRevoked = (payload: { shopId: string }) => {
			if (payload.shopId !== shopId) return;
			// The socket has already been made to leave the rooms server-side;
			// this is the part the person sees. Replace, not push: a revoked
			// member must not be able to navigate back into the seller space
			// with the browser's back button.
			toast.error(t("accessRevoked"));
			router.replace("/");
			router.refresh();
		};

		chatClient.on("inbox:conversation-updated", onUpdated);
		chatClient.on("message:new", onUpdated);
		chatClient.on("shop:access-revoked", onRevoked);

		return () => {
			chatClient.off("inbox:conversation-updated", onUpdated);
			chatClient.off("message:new", onUpdated);
			chatClient.off("shop:access-revoked", onRevoked);
			chatClient.leaveShopInbox(shopId);
		};
	}, [chatClient, shopId, queryClient, router, t]);
}
