import { useLocalSearchParams } from "expo-router";
import { SplitDetailRoute } from "@/src/components/layout/SplitScreen";
import { SPLIT_PARAM } from "@/src/hooks/useSplitSelection";
import { ModerationDisputeDetail } from "@/src/screens/moderation/ModerationDisputeDetail";

export default function ModerationDisputeRoute() {
	const { id } = useLocalSearchParams<{ id: string }>();
	return (
		<SplitDetailRoute listHref={`/moderation/disputes?${SPLIT_PARAM}=${id}`}>
			<ModerationDisputeDetail id={id} />
		</SplitDetailRoute>
	);
}
