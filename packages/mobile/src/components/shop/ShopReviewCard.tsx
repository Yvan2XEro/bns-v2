import { Ionicons } from "@expo/vector-icons";
import { StyleSheet, Text, View } from "react-native";
import { Fonts } from "@/constants/theme";
import { formatDate } from "@/src/lib/formatDate";
import { useTranslation } from "@/src/lib/i18n";
import type { PublicShopReview } from "../../../../api/src/contracts/publicShopReviews";
import { ReviewPhotos } from "./ReviewPhotos";
import { useShopTheme } from "./theme";

export function ShopReviewCard({ review }: { review: PublicShopReview }) {
	const c = useShopTheme();
	const { t, i18n } = useTranslation();
	return (
		<View
			style={[styles.card, { backgroundColor: c.card, borderColor: c.border }]}
		>
			<View style={styles.head}>
				<View
					style={styles.stars}
					accessible
					accessibilityLabel={t("shop.ratingOutOf", { rating: review.rating })}
				>
					{[1, 2, 3, 4, 5].map((n) => (
						<Ionicons
							key={n}
							name="star"
							size={14}
							color={n <= review.rating ? c.sell : c.border}
						/>
					))}
				</View>
				<Text style={[styles.name, { color: c.text }]} numberOfLines={1}>
					{review.reviewerFirstName ?? t("shop.anonymousBuyer")}
				</Text>
				<Text style={[styles.date, { color: c.muted }]}>
					{formatDate(
						review.createdAt,
						{ day: "numeric", month: "short", year: "numeric" },
						i18n.language,
					)}
				</Text>
			</View>
			<View style={styles.verified}>
				<Ionicons
					name="checkmark-circle-outline"
					size={13}
					color={c.successText}
				/>
				<Text style={[styles.verifiedText, { color: c.successText }]}>
					{t("shop.reviewVerifiedPurchase")}
				</Text>
			</View>
			{review.comment ? (
				<Text style={[styles.comment, { color: c.body }]}>
					{review.comment}
				</Text>
			) : null}
			<ReviewPhotos photos={review.photos ?? []} />
		</View>
	);
}

const styles = StyleSheet.create({
	card: { borderWidth: 1, borderRadius: 14, padding: 14, marginBottom: 10 },
	head: { flexDirection: "row", alignItems: "center", gap: 8 },
	stars: { flexDirection: "row", gap: 1 },
	name: { flex: 1, fontSize: 14, fontFamily: Fonts.bodySemibold },
	date: { fontSize: 12, fontFamily: Fonts.body },
	verified: {
		flexDirection: "row",
		alignItems: "center",
		gap: 4,
		marginTop: 4,
	},
	verifiedText: { fontSize: 12, fontFamily: Fonts.bodySemibold },
	comment: {
		fontSize: 14,
		fontFamily: Fonts.body,
		lineHeight: 20,
		marginTop: 8,
	},
});
