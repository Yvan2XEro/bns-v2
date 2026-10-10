"use client";

import { useLocale } from "next-intl";
import { useMemo, useReducer } from "react";
import { ConversationList } from "~/components/seller/inbox/conversation-list";
import { FilterList } from "~/components/seller/inbox/filter-list";
import { ThreadPanel } from "~/components/seller/inbox/thread-panel";
import { useDebouncedValue } from "~/hooks/use-debounced-value";
import { useShopInbox } from "~/hooks/use-shop-inbox";
import { useShopInboxSocket } from "~/hooks/use-shop-inbox-socket";
import type { InboxFilter, ShopRole } from "~/types";

interface State {
	filter: InboxFilter;
	q: string;
	selectedId: string | null;
}

function reducer(state: State, patch: Partial<State>): State {
	return { ...state, ...patch };
}

export function InboxClient({
	shopId,
	role,
	viewerId,
	initialConversationId,
}: {
	shopId: string;
	role: ShopRole | null;
	viewerId: string;
	initialConversationId: string | null;
}) {
	const locale = useLocale();
	const [state, patch] = useReducer(reducer, {
		filter: "all",
		q: "",
		selectedId: initialConversationId,
	});
	const debouncedQ = useDebouncedValue(state.q, 300);

	useShopInboxSocket(shopId);

	const { data, isLoading, hasNextPage, isFetchingNextPage, fetchNextPage } =
		useShopInbox(shopId, { filter: state.filter, q: debouncedQ });

	const conversations = useMemo(
		() => data?.pages.flatMap((page) => page.docs) ?? [],
		[data],
	);
	const totals = data?.pages[0]?.totals;
	const selected =
		conversations.find(
			(conversation) => conversation.id === state.selectedId,
		) ?? null;

	return (
		<div className="grid h-[calc(100vh-10rem)] min-h-0 grid-cols-1 gap-4 lg:grid-cols-[14rem_20rem_1fr]">
			<div
				className={`min-h-0 overflow-y-auto rounded-xl border border-[#E2E8F0] bg-white max-lg:order-first ${
					selected ? "max-lg:hidden" : ""
				}`}
			>
				<FilterList
					filter={state.filter}
					totals={totals}
					onChange={(filter) => patch({ filter })}
				/>
			</div>
			<div
				className={`min-h-0 overflow-hidden rounded-xl border border-[#E2E8F0] bg-white ${
					selected ? "max-lg:hidden" : ""
				}`}
			>
				<ConversationList
					conversations={conversations}
					selectedId={state.selectedId}
					onSelect={(selectedId) => patch({ selectedId })}
					q={state.q}
					onQueryChange={(q) => patch({ q })}
					isLoading={isLoading}
					hasNextPage={Boolean(hasNextPage)}
					isFetchingNextPage={isFetchingNextPage}
					onLoadMore={() => void fetchNextPage()}
					locale={locale}
				/>
			</div>
			<div
				className={`min-h-0 overflow-hidden rounded-xl border border-[#E2E8F0] bg-white ${
					!selected ? "max-lg:hidden" : ""
				}`}
			>
				<ThreadPanel
					shopId={shopId}
					conversation={selected}
					role={role}
					viewerId={viewerId}
					onClose={() => patch({ selectedId: null })}
				/>
			</div>
		</div>
	);
}
