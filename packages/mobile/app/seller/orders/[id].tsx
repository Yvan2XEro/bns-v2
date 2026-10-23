import { useLocalSearchParams } from "expo-router";
import { SplitDetailRoute } from "@/src/components/layout/SplitScreen";
import { SPLIT_PARAM } from "@/src/hooks/useSplitSelection";
import { SellerOrderDetail } from "@/src/screens/seller/SellerOrderDetail";

export default function SellerOrderRoute() {
	const { id } = useLocalSearchParams<{ id: string }>();
	return (
		<SplitDetailRoute listHref={`/seller/orders?${SPLIT_PARAM}=${id}`}>
			<SellerOrderDetail id={id} />
		</SplitDetailRoute>
	);
}
