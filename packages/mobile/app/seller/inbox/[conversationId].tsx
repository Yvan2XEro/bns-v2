import type { InfiniteData } from "@tanstack/react-query";
import { useQueryClient } from "@tanstack/react-query";
import { useLocalSearchParams } from "expo-router";
import { useEffect, useState } from "react";
import { View } from "react-native";
import { ConversationScreen } from "@/src/components/messages/ConversationScreen";
import { AssigneeSheet } from "@/src/components/shop/inbox/AssigneeSheet";
import { ConversationHeader } from "@/src/components/shop/inbox/ConversationHeader";
import { useAlert } from "@/src/contexts/AlertContext";
import { useActiveShop } from "@/src/hooks/useActiveShop";
import {
	useAssignConversation,
	useConversationStatus,
	useMarkConversationRead,
} from "@/src/hooks/useShopInbox";
import { shopKeys } from "@/src/hooks/useShops";
import { useShopTeam } from "@/src/hooks/useShopTeam";
import { resolveErrorMessage } from "@/src/lib/apiError";
import { useAuth } from "@/src/lib/auth";
import { useTranslation } from "@/src/lib/i18n";
import type { InboxConversationView, InboxPage } from "@/src/types/api";

/**
 * Opening a conversation from the list hands us a cache that already holds
 * its row (buyer, listing, assignee, status) — read once, best-effort, so
 * the header has something to show immediately. A deep link that bypasses
 * the list simply starts blank; every action still works because the
 * mutations never depend on this read, only display does.
 */
function findCachedConversation(
	queryClient: ReturnType<typeof useQueryClient>,
	shopId: string,
	conversationId: string,
): InboxConversationView | null {
	const entries = queryClient.getQueriesData<InfiniteData<InboxPage>>({
		queryKey: shopKeys.inboxRoot(shopId),
	});
	for (const [, data] of entries) {
		for (const page of data?.pages ?? []) {
			const found = page.docs.find((doc) => doc.id === conversationId);
			if (found) return found;
		}
	}
	return null;
}

export default function SellerInboxConversationScreen() {
	const { conversationId } = useLocalSearchParams<{ conversationId: string }>();
	const { shop } = useActiveShop();
	const { user } = useAuth();
	const { t } = useTranslation();
	const { showError } = useAlert();
	const queryClient = useQueryClient();
	const shopId = shop?.shopId ?? null;

	const [cached, setCached] = useState<InboxConversationView | null>(null);
	const [hydrated, setHydrated] = useState(false);
	const [assignee, setAssignee] =
		useState<InboxConversationView["assignee"]>(null);
	const [status, setStatus] = useState<"open" | "done">("open");
	const [sheetOpen, setSheetOpen] = useState(false);

	// A one-time read of the already-fetched inbox cache, not a data load —
	// the authoritative source for `assignee`/`status` from here on is each
	// mutation's own response, never a background refetch of this list.
	useEffect(() => {
		if (hydrated || !shopId || !conversationId) return;
		const found = findCachedConversation(queryClient, shopId, conversationId);
		if (found) {
			setCached(found);
			setAssignee(found.assignee);
			setStatus(found.inboxStatus);
		}
		setHydrated(true);
	}, [hydrated, shopId, conversationId, queryClient]);

	const team = useShopTeam(shopId ?? undefined);
	const assignMutation = useAssignConversation(shopId ?? "");
	const statusMutation = useConversationStatus(shopId ?? "");
	const markRead = useMarkConversationRead(shopId ?? "");

	function handleSelectAssignee(userId: string | null) {
		setSheetOpen(false);
		assignMutation.mutate(
			{ conversationId, userId },
			{
				// The response is always the truth, whether or not it matches what
				// was tapped: a race lost to another member still lands here as
				// *their* name, which is exactly what must show up.
				onSuccess: (updated) => {
					setAssignee(updated.assignee);
					setStatus(updated.inboxStatus);
				},
				onError: (error) =>
					showError(t("common.error"), resolveErrorMessage(error, t)),
			},
		);
	}

	function handleToggleStatus() {
		const next = status === "open" ? "done" : "open";
		statusMutation.mutate(
			{ conversationId, status: next },
			{
				onSuccess: (updated) => {
					setStatus(updated.inboxStatus);
					setAssignee(updated.assignee);
				},
				onError: (error) =>
					showError(t("common.error"), resolveErrorMessage(error, t)),
			},
		);
	}

	function handleLatestMessage(messageId: string) {
		if (!shopId) return;
		markRead.mutate({ conversationId, lastMessageId: messageId });
	}

	if (!conversationId) return null;

	return (
		<View style={{ flex: 1 }}>
			<ConversationScreen
				conversationId={conversationId}
				onLatestMessage={handleLatestMessage}
				renderHeader={() => (
					<ConversationHeader
						buyerName={cached?.buyer?.name ?? null}
						listingTitle={cached?.listing?.title ?? null}
						assignee={assignee}
						status={status}
						onAssigneePress={() => setSheetOpen(true)}
						onToggleStatus={handleToggleStatus}
						assigneePending={assignMutation.isPending}
						statusPending={statusMutation.isPending}
					/>
				)}
			/>
			<AssigneeSheet
				visible={sheetOpen}
				onClose={() => setSheetOpen(false)}
				team={team.data}
				callerRole={shop?.role ?? null}
				callerId={user?.id ?? ""}
				currentAssigneeId={assignee?.id ?? null}
				pending={assignMutation.isPending}
				onSelect={handleSelectAssignee}
			/>
		</View>
	);
}
