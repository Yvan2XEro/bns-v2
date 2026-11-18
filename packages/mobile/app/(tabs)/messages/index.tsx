import { type Href, useLocalSearchParams } from "expo-router";
import { SplitScreen } from "@/src/components/layout/SplitScreen";
import { useTranslation } from "@/src/lib/i18n";
import { BuyerConversation } from "@/src/screens/messages/BuyerConversation";
import { ConversationList } from "@/src/screens/messages/ConversationList";

const conversationHref = (id: string): Href => `/messages/${id}`;
/** "Contact the seller" opens a conversation with these; they are its own. */
const CONVERSATION_PARAMS = ["listing", "draft"] as const;

export default function MessagesRoute() {
	const { t } = useTranslation();
	const { listing, draft } = useLocalSearchParams<{
		listing?: string;
		draft?: string;
	}>();
	return (
		<SplitScreen
			detailHref={conversationHref}
			renderList={(props) => <ConversationList {...props} />}
			renderDetail={(id) => (
				<BuyerConversation
					conversationId={id}
					listing={listing}
					draft={draft}
				/>
			)}
			empty={{ illustration: "messages", title: t("split.selectConversation") }}
			itemParams={CONVERSATION_PARAMS}
		/>
	);
}
