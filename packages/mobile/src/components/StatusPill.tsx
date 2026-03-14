import { StyleSheet, Text, View } from "react-native";

const STATUS_COLORS: Record<string, { bg: string; text: string }> = {
	published: { bg: "#dcfce7", text: "#166534" },
	pending: { bg: "#dbeafe", text: "#1e40af" },
	rejected: { bg: "#fee2e2", text: "#991b1b" },
	sold: { bg: "#f3f4f6", text: "#374151" },
	expired: { bg: "#fff7ed", text: "#9a3412" },
	boosted: { bg: "#fef3c7", text: "#92400e" },
	completed: { bg: "#dcfce7", text: "#166534" },
	failed: { bg: "#fee2e2", text: "#991b1b" },
	refunded: { bg: "#f3f4f6", text: "#374151" },
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
	const colors = STATUS_COLORS[status] ?? { bg: "#f3f4f6", text: "#374151" };
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
	text: { fontSize: 12, fontWeight: "600" },
});
