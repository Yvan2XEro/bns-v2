import { useLocalSearchParams } from "expo-router";
import { DisputeThread } from "@/src/screens/disputes/DisputeThread";

/** Reached from several lists, so it never hands over to one of them. */
export default function DisputeThreadRoute() {
	const { id } = useLocalSearchParams<{ id: string }>();
	return <DisputeThread id={id} />;
}
