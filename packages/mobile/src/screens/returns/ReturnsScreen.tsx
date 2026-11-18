import type { Href } from "expo-router";
import { SplitScreen } from "@/src/components/layout/SplitScreen";
import { useTranslation } from "@/src/lib/i18n";
import { ReturnCase } from "@/src/screens/returns/ReturnCase";
import { ReturnsList } from "@/src/screens/returns/ReturnsList";

const itemHref = (id: string): Href => `/returns/${id}`;

export function ReturnsScreen() {
	const { t } = useTranslation();
	return (
		<SplitScreen
			detailHref={itemHref}
			renderList={(props) => <ReturnsList {...props} />}
			renderDetail={(id) => <ReturnCase id={id} />}
			empty={{ illustration: "empty", title: t("split.selectItem") }}
		/>
	);
}
