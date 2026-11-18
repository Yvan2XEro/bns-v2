import { useLocalSearchParams } from "expo-router";
import { ReturnCase } from "@/src/screens/returns/ReturnCase";

/** Reached from several lists, so it never hands over to one of them. */
export default function ReturnCaseRoute() {
	const { id } = useLocalSearchParams<{ id: string }>();
	return <ReturnCase id={id} />;
}
