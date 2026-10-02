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
	const { control, formState, handleSubmit, setError } = useForm<ReviewValues>({
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

	return (
		<Card title={t("purchases.reviewShop")}>
			<Text style={[purchaseText.muted, { color: c.muted }]}>{shopName}</Text>
			<Text style={[purchaseText.label, { color: c.text }]}>
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
										name={filled ? "star" : "star-outline"}
										size={28}
										color={c.sell}
									/>
								</Pressable>
							);
						})}
					</View>
				)}
			/>
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
						maxLength={2000}
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
