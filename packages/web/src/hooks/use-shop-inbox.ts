"use client";

import {
	keepPreviousData,
	useInfiniteQuery,
	useMutation,
	useQueryClient,
} from "@tanstack/react-query";
import type { ApiError } from "~/lib/apiError";
import { inboxKey, inboxRootKey, myShopsKey } from "~/lib/query-keys";
import { shopApi } from "~/lib/shop-api";
import type { InboxConversationView, InboxFilter } from "~/types";

export { inboxKey, inboxRootKey };

export interface ShopInboxFilters {
	filter?: InboxFilter;
	q?: string;
}

/**
 * One shop's inbox, paged with the server's own cursor. `keepPreviousData`
 * holds the current page's totals on screen while a filter or search term
 * changes, rather than flashing to a loading state.
 */
export function useShopInbox(
	shopId: string | null,
	filters: ShopInboxFilters = {},
) {
	return useInfiniteQuery({
		queryKey: inboxKey(shopId ?? "", filters),
		queryFn: ({ pageParam }: { pageParam: string | undefined }) =>
			shopApi.listInbox(shopId ?? "", { ...filters, cursor: pageParam }),
		initialPageParam: undefined as string | undefined,
		getNextPageParam: (last) => last.nextCursor ?? undefined,
		enabled: Boolean(shopId),
		placeholderData: keepPreviousData,
		retry: false,
	});
}

export function useAssignConversation(shopId: string) {
	const queryClient = useQueryClient();
	return useMutation<
		InboxConversationView,
		ApiError,
		{ conversationId: string; userId: string | null }
	>({
		mutationFn: ({ conversationId, userId }) =>
			shopApi.assignConversation(conversationId, userId),
		onSuccess: () => {
			void queryClient.invalidateQueries({ queryKey: inboxRootKey(shopId) });
		},
	});
}

export function useConversationStatus(shopId: string) {
	const queryClient = useQueryClient();
	return useMutation<
		InboxConversationView,
		ApiError,
		{ conversationId: string; status: "open" | "done" }
	>({
		mutationFn: ({ conversationId, status }) =>
			shopApi.setConversationStatus(conversationId, status),
		onSuccess: () => {
			void queryClient.invalidateQueries({ queryKey: inboxRootKey(shopId) });
		},
	});
}

/**
 * Not shop-scoped: the caller may be marking a conversation read from any
 * shop's inbox, or from the buyer side. Every open inbox invalidates itself
 * on its own `shopId` via the broader `myShopsKey` -> badge refresh; a
 * screen that also holds `useShopInbox` open invalidates its own
 * `inboxRootKey` separately when it owns the mutation.
 */
export function useMarkConversationRead() {
	const queryClient = useQueryClient();
	return useMutation<
		{ lastReadAt: string; unreadCount: number },
		ApiError,
		{ conversationId: string; lastMessageId: string; shopId?: string }
	>({
		mutationFn: ({ conversationId, lastMessageId }) =>
			shopApi.markConversationRead(conversationId, lastMessageId),
		onSuccess: (_data, variables) => {
			if (variables.shopId) {
				void queryClient.invalidateQueries({
					queryKey: inboxRootKey(variables.shopId),
				});
			}
			void queryClient.invalidateQueries({ queryKey: myShopsKey() });
		},
	});
}

export function useStartConversation() {
	return useMutation<
		{ conversationId: string; created: boolean },
		ApiError,
		string
	>({
		mutationFn: (listingId: string) => shopApi.startConversation(listingId),
	});
}
