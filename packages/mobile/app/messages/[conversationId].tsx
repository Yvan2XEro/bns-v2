import { useLocalSearchParams } from "expo-router";
import { ConversationScreen } from "@/src/components/messages/ConversationScreen";

export default function MessagesConversationScreen() {
	const { conversationId, listing } = useLocalSearchParams<{
		conversationId: string;
		listing?: string;
	}>();

	if (!conversationId) return null;

	return (
		<ConversationScreen
			conversationId={conversationId}
			listingParam={listing}
		/>
	);
}
