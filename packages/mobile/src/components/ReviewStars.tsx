import { Ionicons } from "@expo/vector-icons";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Colors, Fonts } from "@/constants/theme";
import { useColorScheme } from "@/hooks/use-color-scheme";
import { useTranslation } from "@/src/lib/i18n";

interface ReviewStarsProps {
	rating: number;
	onRate?: (rating: number) => void;
	size?: number;
	showCount?: boolean;
	count?: number;
}

/**
 * Five drawn stars in signage yellow. Read-only it announces itself as one
 * value ("Rated 4.5 out of 5"); with `onRate` each star is a radio with a
 * 44pt target. With `showCount`, the average and the number of reviews sit
 * beside the stars in text, so the rating never rests on colour alone.
 */
export function ReviewStars({
	rating,
	onRate,
	size = 16,
	showCount,
	count,
}: ReviewStarsProps) {
	const isDark = useColorScheme() === "dark";
	const c = isDark ? Colors.dark : Colors.light;
	const { t, i18n } = useTranslation();
	const value = Number.isFinite(rating) ? Math.max(0, Math.min(5, rating)) : 0;
	// Half stars only for display: a picker sets whole stars.
	const rounded = onRate ? Math.round(value) : Math.round(value * 2) / 2;
	const reviews = count ?? 0;
	const formatted = value.toLocaleString(
		i18n.language?.startsWith("en") ? "en-US" : "fr-FR",
		{ minimumFractionDigits: 1, maximumFractionDigits: 1 },
	);

	const iconFor = (star: number): keyof typeof Ionicons.glyphMap =>
		star <= rounded
			? "star"
			: star - 0.5 === rounded
				? "star-half"
				: "star-outline";
	const colorFor = (star: number) => (star - 0.5 <= rounded ? c.sun : c.faint);

	if (onRate) {
		return (
			<View style={styles.row} accessibilityRole="radiogroup">
				{[1, 2, 3, 4, 5].map((star) => (
					<Pressable
						key={star}
						onPress={() => onRate(star)}
						hitSlop={6}
						style={styles.pickTarget}
						accessibilityRole="radio"
						accessibilityState={{ checked: star === rounded }}
						accessibilityLabel={t("purchases.reviewStars", { count: star })}
					>
						<Ionicons name={iconFor(star)} size={size} color={colorFor(star)} />
					</Pressable>
				))}
			</View>
		);
	}

	const noReviews = showCount && reviews === 0;

	return (
		<View
			style={styles.row}
			accessible
			accessibilityLabel={
				noReviews
					? t("profile.noReviews")
					: `${t("shop.ratingOutOf", { rating: formatted })}${
							showCount
								? `, ${t("profile.reviewsTab", { count: reviews })}`
								: ""
						}`
			}
		>
			<View style={styles.stars}>
				{[1, 2, 3, 4, 5].map((star) => (
					<Ionicons
						key={star}
						name={noReviews ? "star-outline" : iconFor(star)}
						size={size}
						color={noReviews ? c.faint : colorFor(star)}
					/>
				))}
			</View>
			{showCount ? (
				noReviews ? (
					<Text style={[styles.count, { color: c.mutedForeground }]}>
						{t("profile.noReviews")}
					</Text>
				) : (
					<Text style={[styles.count, { color: c.mutedForeground }]}>
						<Text style={[styles.value, { color: c.foreground }]}>
							{formatted}
						</Text>{" "}
						({reviews})
					</Text>
				)
			) : null}
		</View>
	);
}

const styles = StyleSheet.create({
	row: { flexDirection: "row", alignItems: "center", gap: 6 },
	stars: { flexDirection: "row", alignItems: "center", gap: 1 },
	pickTarget: {
		minWidth: 44,
		minHeight: 44,
		alignItems: "center",
		justifyContent: "center",
	},
	count: { fontSize: 13, fontFamily: Fonts.body },
	value: { fontFamily: Fonts.bodyBold },
});
