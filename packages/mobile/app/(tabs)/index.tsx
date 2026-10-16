import { Redirect } from "expo-router";
import { LoadingScreen } from "@/src/components/LoadingScreen";
import { useStoredAppMode } from "@/src/hooks/useAppMode";

/** The launch route: opens whichever tab bar the user left the app in. */
export default function Index() {
	const { mode, hydrated } = useStoredAppMode();
	if (!hydrated) return <LoadingScreen />;
	// The seller layout checks the membership and falls back on its own.
	if (mode === "seller")
		return <Redirect href="/(seller-tabs)/sell/dashboard" />;
	return <Redirect href="/(tabs)/home" />;
}
