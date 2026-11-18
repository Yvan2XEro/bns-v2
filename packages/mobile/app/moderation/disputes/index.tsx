import type { Href } from "expo-router";
import { SplitScreen } from "@/src/components/layout/SplitScreen";
import { useTranslation } from "@/src/lib/i18n";
import { ModerationDisputeDetail } from "@/src/screens/moderation/ModerationDisputeDetail";
import { ModerationDisputesQueue } from "@/src/screens/moderation/ModerationDisputesQueue";

const disputeHref = (id: string): Href => `/moderation/disputes/${id}`;

export default function ModerationDisputesRoute() {
	const { t } = useTranslation();
	return (
		<SplitScreen
			detailHref={disputeHref}
			renderList={(props) => <ModerationDisputesQueue {...props} />}
			renderDetail={(id) => <ModerationDisputeDetail id={id} />}
			empty={{ illustration: "empty", title: t("split.selectItem") }}
		/>
	);
}
