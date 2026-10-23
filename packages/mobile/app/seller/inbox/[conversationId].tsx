import { useLocalSearchParams } from "expo-router";
import { SplitDetailRoute } from "@/src/components/layout/SplitScreen";
import { SPLIT_PARAM } from "@/src/hooks/useSplitSelection";
import { SellerInboxConversation } from "@/src/screens/seller/SellerInboxConversation";

export default function SellerInboxConversationRoute() {
	const { conversationId } = useLocalSearchParams<{ conversationId: string }>();
	return (
		<SplitDetailRoute
			listHref={`/seller/inbox?${SPLIT_PARAM}=${conversationId}`}
		>
			<SellerInboxConversation conversationId={conversationId} />
		</SplitDetailRoute>
	);
}
