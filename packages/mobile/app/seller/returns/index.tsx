import type { Href } from "expo-router";
import { SplitScreen } from "@/src/components/layout/SplitScreen";
import { useTranslation } from "@/src/lib/i18n";
import { ReturnCase } from "@/src/screens/returns/ReturnCase";
import { SellerReturnsList } from "@/src/screens/seller/SellerReturnsList";

const returnHref = (id: string): Href => `/returns/${id}`;

export default function SellerReturnsRoute() {
	const { t } = useTranslation();
	return (
		<SplitScreen
			detailHref={returnHref}
			renderList={(props) => <SellerReturnsList {...props} />}
			renderDetail={(id) => <ReturnCase id={id} />}
			empty={{ illustration: "empty", title: t("split.selectItem") }}
		/>
	);
}
