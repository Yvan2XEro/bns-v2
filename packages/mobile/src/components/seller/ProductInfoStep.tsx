import { Ionicons } from "@expo/vector-icons";
import { Image } from "expo-image";
import * as ImagePicker from "expo-image-picker";
import { type Dispatch, type SetStateAction, useState } from "react";
import {
	ActivityIndicator,
	Pressable,
	StyleSheet,
	Text,
	TextInput,
	View,
} from "react-native";
import { Fonts } from "@/constants/theme";
import { CategoryField } from "@/src/components/CategorySheet";
import { useShopTheme } from "@/src/components/shop/theme";
import { useAlert } from "@/src/contexts/AlertContext";
import { useCategories } from "@/src/hooks/useListings";
import { api } from "@/src/lib/api";
import { useTranslation } from "@/src/lib/i18n";
import {
	getCategoryAttributes,
	getListingFormPreset,
	groupListingAttributes,
	type ListingAttribute,
	maskDateInput,
	sanitizeNumberInput,
} from "@/src/lib/listingForm";
import { createMediaUploadFormData } from "@/src/lib/mediaUpload";
import {
	MAX_PRODUCT_IMAGES,
	type ProductFormState,
} from "@/src/lib/productForm";
import { resolveImageUrl } from "@/src/lib/resolveImageUrl";
import type { ListingCondition } from "@/src/types/api";
import { formStyles as f } from "./formStyles";

const CONDITIONS: ListingCondition[] = [
	"new",
	"like_new",
	"good",
	"fair",
	"poor",
];
const CONDITION_KEYS: Record<ListingCondition, string> = {
	new: "conditions.new",
	like_new: "conditions.likeNew",
	good: "conditions.good",
	fair: "conditions.fair",
	poor: "conditions.poor",
};

export function ProductInfoStep({
	form,
	setForm,
	showErrors,
}: {
	form: ProductFormState;
	setForm: Dispatch<SetStateAction<ProductFormState>>;
	showErrors?: boolean;
}) {
	const c = useShopTheme();
	const { t } = useTranslation();
	const { showError, showAlert } = useAlert();
	const categories = useCategories();
	const [uploading, setUploading] = useState(false);
	const preset = getListingFormPreset(form.category);
	const attributes: ListingAttribute[] = getCategoryAttributes(form.category);
	const inputStyle = [
		f.input,
		{ color: c.text, backgroundColor: c.input, borderColor: c.border },
	];

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

	const setAttr = (slug: string, value: string) =>
		setForm((s) => ({ ...s, attributes: { ...s.attributes, [slug]: value } }));

	return (
		<View style={{ gap: 14 }}>
			<View
				style={[f.card, { backgroundColor: c.card, borderColor: c.border }]}
			>
				<View style={f.labelRow}>
					<Text style={[f.label, { color: c.body }]}>
						{t("product.photos")}
					</Text>
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

			<View
				style={[f.card, { backgroundColor: c.card, borderColor: c.border }]}
			>
				<View style={f.labelRow}>
					<Text style={[f.label, { color: c.body }]}>
						{t("product.titleLabel")} *
					</Text>
					<Text style={[f.counter, { color: c.muted }]}>
						{form.title.length} / 120
					</Text>
				</View>
				<TextInput
					value={form.title}
					onChangeText={(title) => setForm((s) => ({ ...s, title }))}
					maxLength={120}
					placeholder={t("product.titlePlaceholder")}
					placeholderTextColor={c.muted}
					style={inputStyle}
					accessibilityLabel={t("product.titleLabel")}
				/>
				{showErrors && form.title.trim().length < 3 ? (
					<Text style={f.error}>{t("product.titleError")}</Text>
				) : null}

				<Text style={[f.label, { color: c.body }]}>
					{t("product.categoryLabel")} *
				</Text>
				<CategoryField
					categories={categories.data?.categories ?? []}
					value={form.category}
					onSelect={(category) =>
						setForm((s) => ({ ...s, category, attributes: {} }))
					}
					onClear={() =>
						setForm((s) => ({ ...s, category: null, attributes: {} }))
					}
					colors={{
						cardBg: c.card,
						textColor: c.text,
						mutedColor: c.muted,
						primary: c.primary,
						border: c.border,
						isDark: c.isDark,
						inputBg: c.input,
					}}
				/>
				{showErrors && !form.category ? (
					<Text style={f.error}>{t("product.categoryError")}</Text>
				) : null}

				{preset.fields.condition.enabled ? (
					<>
						<Text style={[f.label, { color: c.body }]}>
							{t("product.conditionLabel")}
							{preset.fields.condition.required ? " *" : ""}
						</Text>
						<View style={f.chips}>
							{CONDITIONS.map((value) => {
								const active = form.condition === value;
								return (
									<Pressable
										key={value}
										onPress={() =>
											setForm((s) => ({
												...s,
												condition: active ? null : value,
											}))
										}
										style={[
											f.chip,
											{
												borderColor: active ? c.primary : c.border,
												backgroundColor: active ? c.primarySoft : c.card,
											},
										]}
										accessibilityRole="button"
										accessibilityLabel={t(CONDITION_KEYS[value])}
										accessibilityState={{ selected: active }}
									>
										<Text
											style={[
												f.chipText,
												{ color: active ? c.primary : c.body },
											]}
										>
											{t(CONDITION_KEYS[value])}
										</Text>
									</Pressable>
								);
							})}
						</View>
					</>
				) : null}

				{groupListingAttributes(attributes).map((section) => (
					<View key={section.key} style={{ gap: 10 }}>
						{section.title ? (
							<Text style={[f.sectionTitle, { color: c.text }]}>
								{section.title}
							</Text>
						) : null}
						{section.attributes.map((attr) => (
							<AttributeInput
								key={attr.slug}
								attribute={attr}
								value={form.attributes[attr.slug] ?? ""}
								onChange={(value) => setAttr(attr.slug, value)}
							/>
						))}
					</View>
				))}

				<View style={f.labelRow}>
					<Text style={[f.label, { color: c.body }]}>
						{t("product.descriptionLabel")}
					</Text>
					<Text style={[f.counter, { color: c.muted }]}>
						{form.description.length} / 5 000
					</Text>
				</View>
				<TextInput
					value={form.description}
					onChangeText={(description) =>
						setForm((s) => ({ ...s, description }))
					}
					maxLength={5000}
					multiline
					placeholder={t("product.descriptionPlaceholder")}
					placeholderTextColor={c.muted}
					style={[...inputStyle, f.multiline]}
					accessibilityLabel={t("product.descriptionLabel")}
				/>
			</View>
		</View>
	);
}

function AttributeInput({
	attribute,
	value,
	onChange,
}: {
	attribute: ListingAttribute;
	value: string;
	onChange: (value: string) => void;
}) {
	const c = useShopTheme();
	const { t } = useTranslation();
	const label = `${attribute.name}${attribute.unit ? ` (${attribute.unit})` : ""}${attribute.required ? " *" : ""}`;
	const inputStyle = [
		f.input,
		{ color: c.text, backgroundColor: c.input, borderColor: c.border },
	];

	const choices =
		attribute.type === "select"
			? attribute.options.map((o) => ({ value: o.value, label: o.label }))
			: attribute.type === "boolean"
				? [
						{ value: "true", label: t("common.yes") },
						{ value: "false", label: t("common.no") },
					]
				: null;

	return (
		<View style={{ gap: 6 }}>
			<Text style={[f.label, { color: c.body }]}>{label}</Text>
			{choices ? (
				<View style={f.chips}>
					{choices.map((choice) => {
						const active = value === choice.value;
						return (
							<Pressable
								key={choice.value}
								onPress={() => onChange(active ? "" : choice.value)}
								style={[
									f.chip,
									{
										borderColor: active ? c.primary : c.border,
										backgroundColor: active ? c.primarySoft : c.card,
									},
								]}
								accessibilityRole="button"
								accessibilityLabel={choice.label}
								accessibilityState={{ selected: active }}
							>
								<Text
									style={[f.chipText, { color: active ? c.primary : c.body }]}
								>
									{choice.label}
								</Text>
							</Pressable>
						);
					})}
				</View>
			) : (
				<TextInput
					value={value}
					onChangeText={(text) =>
						onChange(
							attribute.type === "number"
								? sanitizeNumberInput(text)
								: attribute.type === "date"
									? maskDateInput(text)
									: text,
						)
					}
					keyboardType={
						attribute.type === "number" || attribute.type === "date"
							? "numeric"
							: "default"
					}
					placeholder={
						attribute.type === "date" ? t("product.datePlaceholder") : undefined
					}
					placeholderTextColor={c.muted}
					style={inputStyle}
					accessibilityLabel={label}
				/>
			)}
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
