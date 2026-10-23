import type { Href } from "expo-router";
import { SplitScreen } from "@/src/components/layout/SplitScreen";
import { useTranslation } from "@/src/lib/i18n";
import { SellerOrderDetail } from "@/src/screens/seller/SellerOrderDetail";
import { SellerOrdersList } from "@/src/screens/seller/SellerOrdersList";

const orderHref = (id: string): Href => `/seller/orders/${id}`;

export default function SellerOrdersRoute() {
	const { t } = useTranslation();
	return (
		<SplitScreen
			detailHref={orderHref}
			renderList={(props) => <SellerOrdersList {...props} />}
			renderDetail={(id) => <SellerOrderDetail id={id} />}
			empty={{ illustration: "empty", title: t("split.selectOrder") }}
		/>
	);
}
