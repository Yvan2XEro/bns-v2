import {
	useInfiniteQuery,
	useMutation,
	useQueryClient,
} from "@tanstack/react-query";
import { shopApi } from "../lib/api";
import { type ShopInboxFilters, shopKeys } from "./useShops";

export function useShopInbox(
	shopId: string | undefined,
	filters: ShopInboxFilters = {},
) {
	return useInfiniteQuery({
		queryKey: shopKeys.inbox(shopId ?? "", filters),
		queryFn: ({ pageParam }: { pageParam: string | undefined }) =>
			shopApi.listInbox(shopId ?? "", { ...filters, cursor: pageParam }),
		initialPageParam: undefined as string | undefined,
		getNextPageParam: (last) => last.nextCursor ?? undefined,
		enabled: Boolean(shopId),
	});
}

function useInvalidateInbox(shopId: string) {
	const queryClient = useQueryClient();
	return () => {
		queryClient.invalidateQueries({ queryKey: shopKeys.inboxRoot(shopId) });
	};
}

export function useAssignConversation(shopId: string) {
	const invalidate = useInvalidateInbox(shopId);
	return useMutation({
		mutationFn: ({
			conversationId,
			userId,
		}: {
			conversationId: string;
			userId: string | null;
		}) => shopApi.assignConversation(conversationId, userId),
		onSuccess: invalidate,
	});
}

export function useConversationStatus(shopId: string) {
	const invalidate = useInvalidateInbox(shopId);
	return useMutation({
		mutationFn: ({
			conversationId,
			status,
		}: {
			conversationId: string;
			status: "open" | "done";
		}) => shopApi.setConversationStatus(conversationId, status),
		onSuccess: invalidate,
	});
}

export function useMarkConversationRead(shopId: string) {
	const invalidate = useInvalidateInbox(shopId);
	return useMutation({
		mutationFn: ({
			conversationId,
			lastMessageId,
		}: {
			conversationId: string;
			lastMessageId: string;
		}) => shopApi.markConversationRead(conversationId, lastMessageId),
		onSuccess: invalidate,
	});
}

/**
 * Not shop-scoped: a buyer calls this against any shop's listing. No mobile
 * query yet caches a buyer's conversation list (the thread screens are not
 * TanStack Query hooks in this package), so there is nothing registered to
 * invalidate here — a future hook that lists conversations invalidates from
 * its own key, the way every other mutation in this file does.
 */
export function useStartConversation() {
	return useMutation({
		mutationFn: (listingId: string) => shopApi.startConversation(listingId),
	});
}
