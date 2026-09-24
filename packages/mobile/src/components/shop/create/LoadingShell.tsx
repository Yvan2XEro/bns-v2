import { ActivityIndicator, StyleSheet } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useShopTheme } from "../theme";
import { Header } from "./Header";

/** Ownership and phone status are both unknown yet — nothing to gate on. */
export function LoadingShell({
	onClose,
	title,
}: {
	onClose: () => void;
	title: string;
}) {
	const c = useShopTheme();
	return (
		<SafeAreaView style={[styles.safe, { backgroundColor: c.bg }]}>
			<Header onClose={onClose} title={title} />
			<ActivityIndicator style={styles.spinner} color={c.primary} />
		</SafeAreaView>
	);
}

const styles = StyleSheet.create({
	safe: { flex: 1 },
	spinner: { marginTop: 40 },
});
