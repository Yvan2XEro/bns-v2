import type { Href } from "expo-router";
import { SplitScreen } from "@/src/components/layout/SplitScreen";
import { useTranslation } from "@/src/lib/i18n";
import { AccountMenu } from "./AccountMenu";
import { ACCOUNT_PANES, isAccountPane } from "./accountPanes";

const paneHref = (id: string): Href =>
	isAccountPane(id) ? ACCOUNT_PANES[id].href : "/(tabs)/account";

function AccountPaneScreen({ id }: { id: string }) {
	if (!isAccountPane(id)) return null;
	const { Screen } = ACCOUNT_PANES[id];
	return <Screen />;
}

/**
 * The account tab: its menu alone on a phone, the chosen entry beside the
 * menu on a tablet in landscape.
 */
export function AccountScreen() {
	const { t } = useTranslation();
	return (
		<SplitScreen
			detailHref={paneHref}
			renderList={(props) => <AccountMenu {...props} />}
			renderDetail={(id) => <AccountPaneScreen id={id} />}
			empty={{ illustration: "empty", title: t("split.selectItem") }}
		/>
	);
}
