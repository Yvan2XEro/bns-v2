import { useLocalSearchParams } from "expo-router";
import { SplitDetailRoute } from "@/src/components/layout/SplitScreen";
import { SPLIT_PARAM } from "@/src/hooks/useSplitSelection";
import { BuyerConversation } from "@/src/screens/messages/BuyerConversation";

export default function MessagesConversationRoute() {
	const { conversationId, listing, draft } = useLocalSearchParams<{
		conversationId: string;
		listing?: string;
		draft?: string;
	}>();
	// On a tablet in landscape the conversation opens beside the list,
	// carrying the listing and draft it was started with.
	const query = new URLSearchParams({ [SPLIT_PARAM]: conversationId });
	if (listing) query.set("listing", listing);
	if (draft) query.set("draft", draft);
	return (
		<SplitDetailRoute listHref={`/messages?${query.toString()}`}>
			<BuyerConversation
				conversationId={conversationId}
				listing={listing}
				draft={draft}
			/>
		</SplitDetailRoute>
	);
}
