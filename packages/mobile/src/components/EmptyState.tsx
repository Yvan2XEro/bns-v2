import { Pressable, StyleSheet, Text, View } from "react-native";
import { useColorScheme } from "@/hooks/use-color-scheme";

interface EmptyStateProps {
	emoji?: string;
	title: string;
	subtitle?: string;
	ctaLabel?: string;
	onCta?: () => void;
}

export function EmptyState({
	emoji = "📭",
	title,
	subtitle,
	ctaLabel,
	onCta,
}: EmptyStateProps) {
	const isDark = useColorScheme() === "dark";

	return (
		<View style={styles.container}>
			<Text style={styles.emoji}>{emoji}</Text>
			<Text style={[styles.title, { color: isDark ? "#e2e8f0" : "#0f172a" }]}>
				{title}
			</Text>
			{subtitle && (
				<Text
					style={[styles.subtitle, { color: isDark ? "#94a3b8" : "#64748b" }]}
				>
					{subtitle}
				</Text>
			)}
			{ctaLabel && onCta && (
				<Pressable
					onPress={onCta}
					style={[
						styles.cta,
						{ backgroundColor: isDark ? "#3b82f6" : "#1e40af" },
					]}
				>
					<Text style={styles.ctaText}>{ctaLabel}</Text>
				</Pressable>
			)}
		</View>
	);
}

const styles = StyleSheet.create({
	container: {
		flex: 1,
		alignItems: "center",
		justifyContent: "center",
		padding: 32,
	},
	emoji: { fontSize: 48, marginBottom: 16 },
	title: {
		fontSize: 18,
		fontWeight: "700",
		textAlign: "center",
		marginBottom: 8,
	},
	subtitle: {
		fontSize: 14,
		textAlign: "center",
		marginBottom: 24,
		lineHeight: 20,
	},
	cta: { borderRadius: 12, paddingHorizontal: 24, paddingVertical: 12 },
	ctaText: { color: "#fff", fontWeight: "700", fontSize: 15 },
});
