import type { Href } from "expo-router";
import { SplitScreen } from "@/src/components/layout/SplitScreen";
import { useTranslation } from "@/src/lib/i18n";
import { PurchaseDetail } from "@/src/screens/purchases/PurchaseDetail";
import { PurchasesList } from "@/src/screens/purchases/PurchasesList";

const purchaseHref = (id: string): Href => `/purchases/${id}`;

export default function PurchasesRoute() {
	const { t } = useTranslation();
	return (
		<SplitScreen
			detailHref={purchaseHref}
			renderList={(props) => <PurchasesList {...props} />}
			renderDetail={(id) => <PurchaseDetail id={id} />}
			empty={{ illustration: "empty", title: t("split.selectOrder") }}
		/>
	);
}
