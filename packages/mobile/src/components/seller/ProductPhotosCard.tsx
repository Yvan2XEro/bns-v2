import { Ionicons } from "@expo/vector-icons";
import { Image } from "expo-image";
import * as ImagePicker from "expo-image-picker";
import { type Dispatch, type SetStateAction, useState } from "react";
import {
	ActivityIndicator,
	Pressable,
	StyleSheet,
	Text,
	View,
} from "react-native";
import { Fonts } from "@/constants/theme";
import { useShopTheme } from "@/src/components/shop/theme";
import { useAlert } from "@/src/contexts/AlertContext";
import { api } from "@/src/lib/api";
import { useTranslation } from "@/src/lib/i18n";
import { createMediaUploadFormData } from "@/src/lib/mediaUpload";
import {
	MAX_PRODUCT_IMAGES,
	type ProductFormState,
} from "@/src/lib/productForm";
import { resolveImageUrl } from "@/src/lib/resolveImageUrl";
import { formStyles as f } from "./formStyles";

/** Photo grid: capture/pick, upload, cover marker, remove. Up to `MAX_PRODUCT_IMAGES`. */
export function ProductPhotosCard({
	form,
	setForm,
}: {
	form: ProductFormState;
	setForm: Dispatch<SetStateAction<ProductFormState>>;
}) {
	const c = useShopTheme();
	const { t } = useTranslation();
	const { showError, showAlert } = useAlert();
	const [uploading, setUploading] = useState(false);

	const pick = async (fromCamera: boolean) => {
		const permission = fromCamera
			? await ImagePicker.requestCameraPermissionsAsync()
			: await ImagePicker.requestMediaLibraryPermissionsAsync();
		if (permission.status !== "granted") {
			showError(t("create.permissionDenied"), t("create.galleryPermissionMsg"));
			return;
		}
		const result = fromCamera
			? await ImagePicker.launchCameraAsync({ quality: 0.85 })
			: await ImagePicker.launchImageLibraryAsync({
					mediaTypes: ["images"],
					allowsMultipleSelection: true,
					selectionLimit: MAX_PRODUCT_IMAGES - form.images.length,
					quality: 0.85,
				});
		if (result.canceled) return;

		setUploading(true);
		try {
			for (const asset of result.assets.slice(
				0,
				MAX_PRODUCT_IMAGES - form.images.length,
			)) {
				const base = `product_${Date.now()}`;
				const data = await createMediaUploadFormData(asset, {
					defaultBaseName: base,
					alt: form.title || base,
				});
				const uploaded = await api.upload<{ doc: { id: string; url: string } }>(
					"/api/media",
					data,
				);
				const id = uploaded?.doc?.id;
				if (!id) throw new Error("upload_failed");
				setForm((s) => ({
					...s,
					images: [...s.images, { id, uri: uploaded.doc.url ?? asset.uri }],
				}));
			}
		} catch {
			showError(t("create.uploadError"), t("create.uploadErrorMsg"));
		} finally {
			setUploading(false);
		}
	};

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
						count: form.images.length,
						max: MAX_PRODUCT_IMAGES,
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
						/>
						{index === 0 ? (
							<View style={styles.cover}>
								<Text style={styles.coverText}>{t("product.cover")}</Text>
							</View>
						) : null}
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
							<Ionicons name="close" size={12} color="#fff" />
						</Pressable>
					</View>
				))}
				{form.images.length < MAX_PRODUCT_IMAGES ? (
					<Pressable
						onPress={addPhoto}
						disabled={uploading}
						style={[styles.photo, styles.add, { borderColor: c.border }]}
						accessibilityRole="button"
						accessibilityLabel={t("product.addPhoto")}
					>
						{uploading ? (
							<ActivityIndicator color={c.primary} />
						) : (
							<>
								<Ionicons name="camera-outline" size={20} color={c.primary} />
								<Text style={[f.hint, { color: c.primary }]}>
									{t("product.addPhoto")}
								</Text>
							</>
						)}
					</Pressable>
				) : null}
			</View>
		</View>
	);
}

const styles = StyleSheet.create({
	photos: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
	photo: { width: 84, height: 84, borderRadius: 12, overflow: "hidden" },
	photoImg: { width: "100%", height: "100%" },
	add: {
		borderWidth: 1,
		borderStyle: "dashed",
		alignItems: "center",
		justifyContent: "center",
		gap: 2,
	},
	cover: {
		position: "absolute",
		left: 4,
		bottom: 4,
		backgroundColor: "rgba(15,23,42,0.75)",
		borderRadius: 6,
		paddingHorizontal: 5,
		paddingVertical: 1,
	},
	coverText: { color: "#fff", fontSize: 10, fontFamily: Fonts.bodySemibold },
	remove: {
		position: "absolute",
		top: 4,
		right: 4,
		width: 20,
		height: 20,
		borderRadius: 10,
		backgroundColor: "rgba(15,23,42,0.75)",
		alignItems: "center",
		justifyContent: "center",
	},
});
