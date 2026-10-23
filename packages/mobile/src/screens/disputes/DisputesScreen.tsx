import type { Href } from "expo-router";
import { SplitScreen } from "@/src/components/layout/SplitScreen";
import { useTranslation } from "@/src/lib/i18n";
import { DisputesList } from "@/src/screens/disputes/DisputesList";
import { DisputeThread } from "@/src/screens/disputes/DisputeThread";

const itemHref = (id: string): Href => `/disputes/${id}`;

export function DisputesScreen() {
	const { t } = useTranslation();
	return (
		<SplitScreen
			detailHref={itemHref}
			renderList={(props) => <DisputesList {...props} />}
			renderDetail={(id) => <DisputeThread id={id} />}
			empty={{ illustration: "empty", title: t("split.selectItem") }}
		/>
	);
}
