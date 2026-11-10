import { StyleSheet, Text, View } from "react-native";
import { Fonts } from "@/constants/theme";

const STATUS_COLORS: Record<string, { bg: string; text: string }> = {
	published: { bg: "#ddf3e5", text: "#155c35" },
	pending: { bg: "#e3e7f8", text: "#23338f" },
	rejected: { bg: "#fbe3e0", text: "#8e2219" },
	sold: { bg: "#eceef5", text: "#3a3f66" },
	expired: { bg: "#fff7ed", text: "#9a3412" },
	boosted: { bg: "#fff1c7", text: "#6e4700" },
	completed: { bg: "#ddf3e5", text: "#155c35" },
	failed: { bg: "#fbe3e0", text: "#8e2219" },
	refunded: { bg: "#eceef5", text: "#3a3f66" },
};

const STATUS_LABELS: Record<string, string> = {
	published: "Publié",
	pending: "En attente",
	rejected: "Rejeté",
	sold: "Vendu",
	expired: "Expiré",
	boosted: "Boosté",
	completed: "Terminé",
	failed: "Échoué",
	refunded: "Remboursé",
};

interface StatusPillProps {
	status: string;
	label?: string;
}

export function StatusPill({ status, label }: StatusPillProps) {
	const colors = STATUS_COLORS[status] ?? { bg: "#eceef5", text: "#3a3f66" };
	return (
		<View style={[styles.pill, { backgroundColor: colors.bg }]}>
			<Text style={[styles.text, { color: colors.text }]}>
				{label ?? STATUS_LABELS[status] ?? status}
			</Text>
		</View>
	);
}

const styles = StyleSheet.create({
	pill: {
		borderRadius: 20,
		paddingHorizontal: 10,
		paddingVertical: 3,
		alignSelf: "flex-start",
	},
	text: { fontSize: 12, fontFamily: Fonts.bodySemibold },
});
