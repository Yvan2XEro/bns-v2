import { Ionicons } from "@expo/vector-icons";
import NetInfo from "@react-native-community/netinfo";
import { onlineManager } from "@tanstack/react-query";
import { useSyncExternalStore } from "react";
import { StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Fonts } from "@/constants/theme";
import { useTranslation } from "@/src/lib/i18n";
import { isOnline } from "@/src/lib/onlineStatus";

// TanStack Query pauses fetches and mutations while offline and resumes them
// on reconnect; cached data stays on screen meanwhile.
onlineManager.setEventListener((setOnline) =>
	NetInfo.addEventListener((state) => setOnline(isOnline(state))),
);

function useIsOnline(): boolean {
	return useSyncExternalStore(
		(listener) => onlineManager.subscribe(listener),
		() => onlineManager.isOnline(),
	);
}

export function OfflineBanner() {
	const online = useIsOnline();
	const { top } = useSafeAreaInsets();
	const { t } = useTranslation();
	if (online) return null;
	return (
		<View
			pointerEvents="none"
			accessibilityRole="alert"
			accessibilityLiveRegion="polite"
			style={[styles.wrap, { top: top + 6 }]}
		>
			<View style={styles.pill}>
				<Ionicons name="cloud-offline-outline" size={14} color="#fff" />
				<Text style={styles.text}>{t("common.offlineBanner")}</Text>
			</View>
		</View>
	);
}

const styles = StyleSheet.create({
	wrap: {
		position: "absolute",
		left: 0,
		right: 0,
		alignItems: "center",
		zIndex: 1000,
		elevation: 1000,
	},
	pill: {
		flexDirection: "row",
		alignItems: "center",
		gap: 6,
		borderRadius: 999,
		backgroundColor: "#0f172a",
		paddingHorizontal: 12,
		paddingVertical: 6,
	},
	text: { color: "#fff", fontSize: 13, fontFamily: Fonts.bodySemibold },
});
