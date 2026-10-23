import { useLocalSearchParams } from "expo-router";
import { ListingDetail } from "@/src/screens/listing/ListingDetail";

export default function ListingRoute() {
	const { id } = useLocalSearchParams<{ id: string }>();
	return <ListingDetail id={id} />;
}
