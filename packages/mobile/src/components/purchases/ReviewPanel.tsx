import { Ionicons } from "@expo/vector-icons";
import { zodResolver } from "@hookform/resolvers/zod";
import { Image } from "expo-image";
import * as ImagePicker from "expo-image-picker";
import { useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { Fonts } from "@/constants/theme";
import { useReviewOrder } from "@/src/hooks/useReviewOrder";
import { api } from "@/src/lib/api";
import { resolveErrorMessage } from "@/src/lib/apiError";
import { useTranslation } from "@/src/lib/i18n";
import { createMediaUploadFormData } from "@/src/lib/mediaUpload";
import { type ReviewValues, reviewSchema } from "@/src/lib/purchaseForms";
import {
	addPendingPhotos,
	type PendingReviewPhoto,
	pendingPhotoFromAsset,
	REVIEW_PHOTO_ISSUE_KEYS,
	REVIEW_PHOTO_ISSUE_PARAMS,
	REVIEW_PHOTOS_MAX,
} from "@/src/lib/reviewPhotos";
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
	const [photos, setPhotos] = useState<PendingReviewPhoto[]>([]);
	const [photoIssue, setPhotoIssue] = useState<string | null>(null);
	const [uploading, setUploading] = useState(false);

	const pickPhotos = async () => {
		const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
		if (permission.status !== "granted") return;
		const result = await ImagePicker.launchImageLibraryAsync({
			mediaTypes: ["images"],
			allowsMultipleSelection: true,
			selectionLimit: REVIEW_PHOTOS_MAX - photos.length,
			quality: 0.85,
		});
		if (result.canceled || !result.assets?.length) return;
		const { photos: next, issue } = addPendingPhotos(
			photos,
			result.assets.map(pendingPhotoFromAsset),
		);
		setPhotos(next);
		setPhotoIssue(
			issue
				? t(REVIEW_PHOTO_ISSUE_KEYS[issue], REVIEW_PHOTO_ISSUE_PARAMS)
				: null,
		);
	};

	const removePhoto = (uri: string) => {
		setPhotos((current) => current.filter((photo) => photo.uri !== uri));
		setPhotoIssue(null);
	};

	const uploadPhotos = async (): Promise<string[]> => {
		setUploading(true);
		try {
			return await Promise.all(
				photos.map(async (photo, index) => {
					const data = await createMediaUploadFormData(photo, {
						defaultBaseName: `review_${Date.now()}_${index}`,
						alt: shopName,
					});
					const uploaded = await api.upload<{ doc: { id: string } }>(
						"/api/media",
						data,
					);
					if (!uploaded?.doc?.id) throw new Error("upload_failed");
					return uploaded.doc.id;
				}),
			);
		} finally {
			setUploading(false);
		}
	};
	const { control, formState, handleSubmit, setError, watch } =
		useForm<ReviewValues>({
			resolver: zodResolver(reviewSchema),
			defaultValues: { comment: "" },
		});

	const onSubmit = handleSubmit(async ({ rating, comment }) => {
		try {
			const photoIds = await uploadPhotos();
			await review.mutateAsync({
				rating,
				...(comment ? { comment } : {}),
				...(photoIds.length > 0 ? { photos: photoIds } : {}),
			});
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
			<View style={styles.photosHead}>
				<Text style={[styles.photosTitle, { color: c.text }]}>
					{t("purchases.reviewPhotos")}
				</Text>
				<Text style={[purchaseText.muted, { color: c.muted }]}>
					{t("purchases.reviewPhotosHint", { max: REVIEW_PHOTOS_MAX })}
				</Text>
			</View>
			<View style={styles.photos}>
				{photos.map((photo, index) => (
					<View key={photo.uri} style={styles.photo}>
						<Image
							source={{ uri: photo.uri }}
							style={[styles.photoImage, { backgroundColor: c.input }]}
							contentFit="cover"
						/>
						<Pressable
							onPress={() => removePhoto(photo.uri)}
							hitSlop={8}
							accessibilityRole="button"
							accessibilityLabel={t("purchases.reviewPhotoRemove", {
								index: index + 1,
							})}
							style={[styles.photoRemove, { backgroundColor: c.text }]}
						>
							<Ionicons name="close" size={14} color={c.bg} />
						</Pressable>
					</View>
				))}
				{photos.length < REVIEW_PHOTOS_MAX ? (
					<Pressable
						onPress={pickPhotos}
						accessibilityRole="button"
						accessibilityLabel={t("purchases.reviewPhotoAdd")}
						style={[styles.photoAdd, { borderColor: c.muted }]}
					>
						<Ionicons name="camera-outline" size={20} color={c.muted} />
						<Text style={[styles.photoAddText, { color: c.muted }]}>
							{t("purchases.reviewPhotoAdd")}
						</Text>
					</Pressable>
				) : null}
			</View>
			<FieldError message={photoIssue} />
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
				pending={review.isPending || uploading}
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
	photosHead: {
		flexDirection: "row",
		alignItems: "baseline",
		justifyContent: "space-between",
	},
	photosTitle: { fontSize: 14, fontFamily: Fonts.bodySemibold },
	photos: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
	photo: { width: 68, height: 68 },
	photoImage: { width: 68, height: 68, borderRadius: 10 },
	photoRemove: {
		position: "absolute",
		top: -6,
		right: -6,
		width: 22,
		height: 22,
		borderRadius: 11,
		alignItems: "center",
		justifyContent: "center",
	},
	photoAdd: {
		width: 68,
		height: 68,
		borderRadius: 10,
		borderWidth: 1.5,
		borderStyle: "dashed",
		alignItems: "center",
		justifyContent: "center",
		gap: 2,
	},
	photoAddText: { fontSize: 10, fontFamily: Fonts.bodySemibold },
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
