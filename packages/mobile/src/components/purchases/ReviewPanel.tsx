import { Ionicons } from "@expo/vector-icons";
import { zodResolver } from "@hookform/resolvers/zod";
import { Controller, useForm } from "react-hook-form";
import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { Fonts } from "@/constants/theme";
import { useReviewOrder } from "@/src/hooks/useReviewOrder";
import { resolveErrorMessage } from "@/src/lib/apiError";
import { useTranslation } from "@/src/lib/i18n";
import { type ReviewValues, reviewSchema } from "@/src/lib/purchaseForms";
import { useShopTheme } from "../shop/theme";
import { Card, FieldError, PurchaseButton, purchaseText } from "./ui";

const RATINGS = [1, 2, 3, 4, 5] as const;
const COMMENT_MAX = 2000;

/**
 * Mounted only while `availableActions` offers `review_shop`, which reads the
 * serialised `reviewable`; once published the purchase is refetched and the
 * panel leaves with the flag.
 */
export function ReviewPanel({
	orderId,
	shopName,
}: {
	orderId: string;
	shopName: string;
}) {
	const c = useShopTheme();
	const { t } = useTranslation();
	const review = useReviewOrder(orderId);
	const { control, formState, handleSubmit, setError, watch } =
		useForm<ReviewValues>({
			resolver: zodResolver(reviewSchema),
			defaultValues: { comment: "" },
		});

	const onSubmit = handleSubmit(async ({ rating, comment }) => {
		try {
			await review.mutateAsync({ rating, ...(comment ? { comment } : {}) });
		} catch (error) {
			setError("root", { message: resolveErrorMessage(error, t) });
		}
	});

	const ratingError = formState.errors.rating?.message;
	const rating = watch("rating");
	const comment = watch("comment") ?? "";

	return (
		<Card title={t("purchases.reviewShop")}>
			<View style={styles.shopRow}>
				<Text style={[purchaseText.muted, { color: c.muted, flex: 1 }]}>
					{shopName}
				</Text>
				<View style={[styles.verified, { backgroundColor: c.successSoft }]}>
					<Ionicons
						name="checkmark-circle-outline"
						size={13}
						color={c.successText}
					/>
					<Text style={[styles.verifiedText, { color: c.successText }]}>
						{t("purchases.reviewVerified")}
					</Text>
				</View>
			</View>
			<View style={[styles.ratingBox, { borderColor: c.border }]}>
				<Text style={[purchaseText.muted, { color: c.muted }]}>
					{t("purchases.reviewRating")}
				</Text>
				<Controller
					control={control}
					name="rating"
					render={({ field }) => (
						<View style={styles.stars} accessibilityRole="radiogroup">
							{RATINGS.map((value) => {
								const filled = (field.value ?? 0) >= value;
								return (
									<Pressable
										key={value}
										onPress={() => field.onChange(value)}
										accessibilityRole="radio"
										accessibilityState={{ checked: field.value === value }}
										accessibilityLabel={t("purchases.reviewStars", {
											count: value,
										})}
										style={styles.star}
									>
										<Ionicons
											name="star"
											size={32}
											color={filled ? c.sell : c.border}
										/>
									</Pressable>
								);
							})}
						</View>
					)}
				/>
				<Text style={[styles.ratingWord, { color: rating ? c.text : c.muted }]}>
					{rating
						? t(`purchases.reviewRatingWords.${rating}`)
						: t("purchases.reviewPickRating")}
				</Text>
			</View>
			<FieldError message={ratingError ? t(ratingError) : null} />
			<Controller
				control={control}
				name="comment"
				render={({ field }) => (
					<TextInput
						value={field.value}
						onChangeText={field.onChange}
						onBlur={field.onBlur}
						multiline
						maxLength={COMMENT_MAX}
						accessibilityLabel={t("purchases.reviewComment")}
						placeholder={t("purchases.reviewComment")}
						placeholderTextColor={c.muted}
						style={[
							styles.input,
							{
								color: c.text,
								backgroundColor: c.input,
								borderColor: c.border,
							},
						]}
					/>
				)}
			/>
			<Text style={[styles.counter, { color: c.muted }]}>
				{t("purchases.reviewCounter", {
					count: comment.length,
					max: COMMENT_MAX,
				})}
			</Text>
			<View style={[styles.note, { backgroundColor: c.successSoft }]}>
				<Ionicons
					name="shield-checkmark-outline"
					size={16}
					color={c.successText}
				/>
				<Text style={[styles.noteText, { color: c.successText }]}>
					{t("purchases.reviewVerifiedNote")}
				</Text>
			</View>
			<FieldError message={formState.errors.root?.message} />
			{review.isSuccess ? (
				<Text style={[purchaseText.muted, { color: c.successText }]}>
					{t("purchases.reviewSent")}
				</Text>
			) : null}
			<PurchaseButton
				label={t("purchases.reviewSubmit")}
				pending={review.isPending}
				onPress={onSubmit}
			/>
		</Card>
	);
}

const styles = StyleSheet.create({
	shopRow: { flexDirection: "row", alignItems: "center", gap: 8 },
	verified: {
		flexDirection: "row",
		alignItems: "center",
		gap: 4,
		borderRadius: 999,
		paddingHorizontal: 8,
		paddingVertical: 3,
	},
	verifiedText: { fontSize: 12, fontFamily: Fonts.bodySemibold },
	ratingBox: {
		alignItems: "center",
		borderWidth: 1,
		borderRadius: 14,
		paddingVertical: 12,
		gap: 4,
	},
	ratingWord: { fontSize: 16, fontFamily: Fonts.displayBold },
	counter: {
		fontSize: 12,
		fontFamily: Fonts.body,
		textAlign: "right",
		marginTop: -4,
	},
	note: {
		flexDirection: "row",
		gap: 8,
		borderRadius: 12,
		padding: 12,
		alignItems: "flex-start",
	},
	noteText: { flex: 1, fontSize: 13, fontFamily: Fonts.body, lineHeight: 18 },
	stars: { flexDirection: "row", gap: 4 },
	star: {
		width: 44,
		height: 44,
		alignItems: "center",
		justifyContent: "center",
	},
	input: {
		minHeight: 80,
		borderWidth: 1,
		borderRadius: 12,
		padding: 12,
		fontSize: 14,
		fontFamily: Fonts.body,
		textAlignVertical: "top",
	},
});
