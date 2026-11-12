import type { InfiniteData } from "@tanstack/react-query";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { router } from "expo-router";
import { useEffect, useState } from "react";
import { View } from "react-native";
import {
	buyerNameOf,
	ConversationScreen,
} from "@/src/components/messages/ConversationScreen";
import { AssigneeSheet } from "@/src/components/shop/inbox/AssigneeSheet";
import { ConversationHeader } from "@/src/components/shop/inbox/ConversationHeader";
import { toast } from "@/src/components/Toast";
import { useAlert } from "@/src/contexts/AlertContext";
import { useActiveShop } from "@/src/hooks/useActiveShop";
import {
	useAssignConversation,
	useConversationStatus,
	useMarkConversationRead,
} from "@/src/hooks/useShopInbox";
import { shopKeys } from "@/src/hooks/useShops";
import { useShopTeam } from "@/src/hooks/useShopTeam";
import { api } from "@/src/lib/api";
import { resolveErrorMessage } from "@/src/lib/apiError";
import { useAuth } from "@/src/lib/auth";
import { useTranslation } from "@/src/lib/i18n";
import type {
	Conversation,
	InboxConversationView,
	InboxPage,
	PayloadDoc,
} from "@/src/types/api";

function unwrapDoc<T>(value: PayloadDoc<T> | T): T {
	return value && typeof value === "object" && "doc" in value
		? (value as PayloadDoc<T>).doc
		: (value as T);
}

/** The thread's listing title from the conversation itself, when it was opened from one. */
function listingTitleOf(conv: Conversation | undefined): string | null {
	return conv?.listing && typeof conv.listing === "object"
		? conv.listing.title
		: null;
}

/** The thread's listing id, for the header's link to the ad. */
function listingIdOf(conv: Conversation | undefined): string | null {
	if (!conv?.listing) return null;
	return typeof conv.listing === "object" ? conv.listing.id : conv.listing;
}

/** The order the thread was opened for, when there is one. */
function orderIdOf(conv: Conversation | undefined): string | null {
	const order = (conv as { order?: unknown } | undefined)?.order;
	if (!order) return null;
	return typeof order === "object"
		? String((order as { id: unknown }).id)
		: String(order);
}

/** The buyer's account id, for a report from the shop side. */
function buyerIdOf(conv: Conversation | undefined): string | null {
	if (!conv?.buyer) return null;
	return typeof conv.buyer === "object" ? conv.buyer.id : conv.buyer;
}

/**
 * The assignee and status as the conversation document holds them (`depth=2`
 * populates the assignee): what the header shows when the thread was opened
 * from a push or a link, with no inbox row in the cache.
 */
function stateFromConversation(conv: Conversation): {
	assignee: InboxConversationView["assignee"];
	status: "open" | "done";
} {
	const raw = conv as {
		assignee?: unknown;
		inboxStatus?: string | null;
	};
	const person =
		raw.assignee && typeof raw.assignee === "object"
			? (raw.assignee as {
					id: string;
					name?: string | null;
					avatar?: { url?: string | null } | null;
				})
			: null;
	return {
		assignee: person
			? {
					id: person.id,
					name: person.name ?? null,
					avatarUrl: person.avatar?.url ?? null,
					suspended: false,
				}
			: null,
		status: raw.inboxStatus === "done" ? "done" : "open",
	};
}

/**
 * Opening a conversation from the list hands us a cache that already holds
 * its row (buyer, listing, assignee, status) — read once, so the header has
 * something to show immediately. A deep link that bypasses the list waits
 * for the conversation document instead, with the chips disabled meanwhile:
 * a blank "Unassigned" invited a member to take a thread a colleague held.
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

/** One conversation of the shop inbox: its own screen on a phone, the detail pane on a tablet. */
export function SellerInboxConversation({
	conversationId,
}: {
	conversationId: string;
}) {
	const { shop } = useActiveShop();
	const { user } = useAuth();
	const { t } = useTranslation();
	const { showError, showSuccess } = useAlert();
	const queryClient = useQueryClient();
	const shopId = shop?.shopId ?? null;

	const [cached, setCached] = useState<InboxConversationView | null>(null);
	const [hydrated, setHydrated] = useState(false);
	const [assignee, setAssignee] =
		useState<InboxConversationView["assignee"]>(null);
	const [status, setStatus] = useState<"open" | "done">("open");
	/** Whether `assignee` and `status` are known, from the list or the document. */
	const [stateKnown, setStateKnown] = useState(false);
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
			setStateKnown(true);
		}
		setHydrated(true);
	}, [hydrated, shopId, conversationId, queryClient]);

	// Same key and fetcher as `ConversationScreen`'s own query: no extra
	// request, just a read of the document it loads.
	const convQuery = useQuery({
		queryKey: ["conversation", conversationId],
		queryFn: () =>
			api.get<Conversation | PayloadDoc<Conversation>>(
				`/api/conversations/${conversationId}?depth=2`,
			),
		enabled: Boolean(conversationId),
	});
	const convDoc = convQuery.data ? unwrapDoc(convQuery.data) : undefined;
	// Fills the header from the document once, when the list had no row.
	useEffect(() => {
		if (stateKnown || !hydrated || !convDoc) return;
		const state = stateFromConversation(convDoc);
		setAssignee(state.assignee);
		setStatus(state.status);
		setStateKnown(true);
	}, [stateKnown, hydrated, convDoc]);

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
					setStateKnown(true);
				},
				onError: (error) =>
					showError(t("common.error"), resolveErrorMessage(error, t)),
			},
		);
	}

	function handleToggleStatus() {
		changeStatus(status === "open" ? "done" : "open");
	}

	function changeStatus(next: "open" | "done", undoing = false) {
		statusMutation.mutate(
			{ conversationId, status: next },
			{
				onSuccess: (updated) => {
					setStatus(updated.inboxStatus);
					setAssignee(updated.assignee);
					setStateKnown(true);
					// "Terminé" is one tap on a busy screen: it can be taken back from
					// the toast. Reopening, or an undo itself, needs no way back.
					if (updated.inboxStatus === "done" && !undoing) {
						toast.show({
							type: "success",
							title: t("inbox.markedDone"),
							action: {
								label: t("common.undo"),
								onPress: () => changeStatus("open", true),
							},
						});
					} else {
						showSuccess(
							updated.inboxStatus === "done"
								? t("inbox.markedDone")
								: t("inbox.reopened"),
						);
					}
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
				renderHeader={(conv) => {
					const listingId = listingIdOf(conv);
					const orderId = orderIdOf(conv);
					const buyerId = buyerIdOf(conv);
					return (
						<ConversationHeader
							buyerName={cached?.buyer?.name ?? buyerNameOf(conv)}
							buyerAvatarUrl={
								cached?.buyer?.avatarUrl ??
								(conv?.buyer && typeof conv.buyer === "object"
									? (conv.buyer.avatar?.url ?? null)
									: null)
							}
							listingTitle={cached?.listing?.title ?? listingTitleOf(conv)}
							onListingPress={
								listingId
									? () => router.push(`/listing/${listingId}` as never)
									: undefined
							}
							onOrderPress={
								orderId
									? () => router.push(`/seller/orders/${orderId}` as never)
									: undefined
							}
							onReportBuyer={
								buyerId
									? () =>
											router.push({
												pathname: "/report",
												params: { targetType: "user", targetId: buyerId },
											})
									: undefined
							}
							assignee={assignee}
							status={status}
							stateLoading={!stateKnown}
							onAssigneePress={() => setSheetOpen(true)}
							onToggleStatus={handleToggleStatus}
							assigneePending={assignMutation.isPending}
							statusPending={statusMutation.isPending}
						/>
					);
				}}
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
