import { useLocalSearchParams } from "expo-router";
import { SplitDetailRoute } from "@/src/components/layout/SplitScreen";
import { SPLIT_PARAM } from "@/src/hooks/useSplitSelection";
import { PurchaseDetail } from "@/src/screens/purchases/PurchaseDetail";

export default function PurchaseRoute() {
	const { id } = useLocalSearchParams<{ id: string }>();
	return (
		<SplitDetailRoute listHref={`/purchases?${SPLIT_PARAM}=${id}`}>
			<PurchaseDetail id={id} />
		</SplitDetailRoute>
	);
}
