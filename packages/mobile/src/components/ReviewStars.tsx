import { Pressable, StyleSheet, Text, View } from "react-native";

interface ReviewStarsProps {
	rating: number;
	onRate?: (rating: number) => void;
	size?: number;
	showCount?: boolean;
	count?: number;
}

export function ReviewStars({
	rating,
	onRate,
	size = 16,
	showCount,
	count,
}: ReviewStarsProps) {
	return (
		<View style={styles.row}>
			{[1, 2, 3, 4, 5].map((star) => (
				<Pressable key={star} onPress={() => onRate?.(star)} disabled={!onRate}>
					<Text style={{ fontSize: size }}>
						{star <= Math.round(rating) ? "⭐" : "☆"}
					</Text>
				</Pressable>
			))}
			{showCount && <Text style={styles.count}>({count ?? 0})</Text>}
		</View>
	);
}

const styles = StyleSheet.create({
	row: { flexDirection: "row", alignItems: "center", gap: 2 },
	count: { fontSize: 12, color: "#64748b", marginLeft: 4 },
});
