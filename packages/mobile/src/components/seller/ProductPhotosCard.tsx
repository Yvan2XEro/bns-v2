import { Ionicons } from "@expo/vector-icons";
import { Image } from "expo-image";
import type { Dispatch, SetStateAction } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Fonts } from "@/constants/theme";
import {
	PendingPhotoErrors,
	PendingPhotoTile,
} from "@/src/components/PendingPhotoTile";
import { useShopTheme } from "@/src/components/shop/theme";
import { useAlert } from "@/src/contexts/AlertContext";
import { useAppConfig } from "@/src/contexts/AppConfigContext";
import type { PhotoUploads } from "@/src/hooks/usePhotoUploads";
import { useTranslation } from "@/src/lib/i18n";
import { photoLimitStatus } from "@/src/lib/photoLimit";
import { makeMain } from "@/src/lib/photoQueue";
import type { ProductFormState } from "@/src/lib/productForm";
import { resolveImageUrl } from "@/src/lib/resolveImageUrl";
import { formStyles as f } from "./formStyles";

/**
 * Photo grid: capture/pick, upload, cover marker, make cover, remove. Up to
 * the admin's `photosIncluded`; a product saved with more keeps them and can
 * only remove. The upload queue comes from the screen's content component, so
 * photos still sending survive a step change.
 */
export function ProductPhotosCard({
	form,
	setForm,
	uploads,
	readOnly,
}: {
	form: ProductFormState;
	setForm: Dispatch<SetStateAction<ProductFormState>>;
	uploads: PhotoUploads;
	/** No add, remove or cover change: the photos are shown, not edited. */
	readOnly?: boolean;
}) {
	const c = useShopTheme();
	const { t } = useTranslation();
	const { showAlert } = useAlert();
	const { photosIncluded } = useAppConfig();
	const photos = photoLimitStatus(
		form.images.length + uploads.pending.length,
		photosIncluded,
	);
	const pick = (fromCamera: boolean) =>
		void uploads.pick(fromCamera, photos.remaining);

	const addPhoto = () =>
		showAlert(t("create.addPhotoTitle"), t("create.addPhotoSource"), [
			{ text: t("create.camera"), onPress: () => pick(true) },
			{ text: t("create.gallery"), onPress: () => pick(false) },
			{ text: t("common.cancel"), style: "cancel" },
		]);

	return (
		<View style={[f.card, { backgroundColor: c.card, borderColor: c.border }]}>
			<View style={f.labelRow}>
				<Text style={[f.label, { color: c.body }]}>{t("product.photos")}</Text>
				<Text style={[f.counter, { color: c.muted }]}>
					{t("product.photosCount", {
						count: form.images.length + uploads.pending.length,
						max: photos.max,
					})}
				</Text>
			</View>
			<View style={styles.photos}>
				{form.images.map((image, index) => (
					<View key={image.id} style={styles.photo}>
						<Image
							source={{ uri: resolveImageUrl(image.uri) ?? image.uri }}
							style={styles.photoImg}
							contentFit="cover"
							accessibilityIgnoresInvertColors
						/>
						{index === 0 ? (
							<View style={styles.cover}>
								<Text style={styles.coverText}>{t("product.cover")}</Text>
							</View>
						) : readOnly ? null : (
							// Any photo can take the cover's place, as on the listing
							// form, instead of deleting and re-adding the others.
							<Pressable
								onPress={() =>
									setForm((s) => ({ ...s, images: makeMain(s.images, index) }))
								}
								hitSlop={8}
								style={styles.makeCover}
								accessibilityRole="button"
								accessibilityLabel={t("create.makeMain")}
							>
								<Ionicons name="star-outline" size={16} color="#ffffff" />
							</Pressable>
						)}
						{readOnly ? null : (
							<Pressable
								onPress={() =>
									setForm((s) => ({
										...s,
										images: s.images.filter((i) => i.id !== image.id),
									}))
								}
								style={styles.remove}
								hitSlop={12}
								accessibilityRole="button"
								accessibilityLabel={t("create.removePhoto")}
							>
								<Ionicons name="close" size={16} color="#ffffff" />
							</Pressable>
						)}
					</View>
				))}
				{uploads.pending.map((photo) => (
					<PendingPhotoTile
						key={photo.key}
						photo={photo}
						onRetry={() => uploads.retry(photo.key)}
						onRemove={() => uploads.remove(photo.key)}
						style={styles.photo}
					/>
				))}
				{readOnly ? null : (
					<Pressable
						onPress={addPhoto}
						disabled={photos.full}
						style={({ pressed }) => [
							styles.photo,
							styles.add,
							{
								borderColor: c.link,
								backgroundColor: pressed ? c.primarySoft : "transparent",
							},
							photos.full && { opacity: 0.4 },
						]}
						accessibilityRole="button"
						accessibilityLabel={t("product.addPhoto")}
						accessibilityState={{ disabled: photos.full }}
					>
						<Ionicons name="camera-outline" size={22} color={c.link} />
						<Text style={[styles.addText, { color: c.link }]} numberOfLines={2}>
							{t("product.addPhoto")}
						</Text>
					</Pressable>
				)}
			</View>
			<PendingPhotoErrors photos={uploads.pending} />
			{photos.full ? (
				<Text style={[f.hint, { color: c.muted, marginTop: 8 }]}>
					{t("photoLimit.moreSoon")}
				</Text>
			) : null}
		</View>
	);
}

const styles = StyleSheet.create({
	photos: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
	photo: { width: 88, height: 88, borderRadius: 12, overflow: "hidden" },
	photoImg: { width: "100%", height: "100%" },
	add: {
		borderWidth: 1.5,
		borderStyle: "dashed",
		alignItems: "center",
		justifyContent: "center",
		gap: 4,
		padding: 4,
	},
	addText: {
		fontSize: 12,
		lineHeight: 16,
		fontFamily: Fonts.bodySemibold,
		textAlign: "center",
	},
	cover: {
		position: "absolute",
		left: 4,
		bottom: 4,
		backgroundColor: "rgba(18, 22, 58, 0.75)",
		borderRadius: 6,
		paddingHorizontal: 6,
		paddingVertical: 2,
	},
	coverText: {
		color: "#ffffff",
		fontSize: 12,
		lineHeight: 16,
		fontFamily: Fonts.bodyBold,
	},
	makeCover: {
		position: "absolute",
		left: 4,
		bottom: 4,
		width: 32,
		height: 32,
		borderRadius: 16,
		backgroundColor: "rgba(18, 22, 58, 0.75)",
		alignItems: "center",
		justifyContent: "center",
	},
	remove: {
		position: "absolute",
		top: 4,
		right: 4,
		width: 28,
		height: 28,
		borderRadius: 14,
		backgroundColor: "rgba(18, 22, 58, 0.75)",
		alignItems: "center",
		justifyContent: "center",
	},
});
