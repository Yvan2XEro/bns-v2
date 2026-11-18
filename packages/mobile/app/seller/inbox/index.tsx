import type { Href } from "expo-router";
import { SplitScreen } from "@/src/components/layout/SplitScreen";
import { useTranslation } from "@/src/lib/i18n";
import { SellerInboxConversation } from "@/src/screens/seller/SellerInboxConversation";
import { SellerInboxList } from "@/src/screens/seller/SellerInboxList";

const conversationHref = (id: string): Href => `/seller/inbox/${id}`;

export default function SellerInboxRoute() {
	const { t } = useTranslation();
	return (
		<SplitScreen
			detailHref={conversationHref}
			renderList={(props) => <SellerInboxList {...props} />}
			renderDetail={(id) => <SellerInboxConversation conversationId={id} />}
			empty={{ illustration: "messages", title: t("split.selectConversation") }}
		/>
	);
}
