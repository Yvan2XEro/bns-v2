import { Ionicons } from "@expo/vector-icons";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Image } from "expo-image";
import * as ImagePicker from "expo-image-picker";
import { router, useLocalSearchParams } from "expo-router";
import { useEffect, useState } from "react";
import {
	ActivityIndicator,
	Pressable,
	ScrollView,
	StyleSheet,
	Text,
	TextInput,
	View,
} from "react-native";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";
import { SafeAreaView } from "react-native-safe-area-context";
import { Fonts } from "@/constants/theme";
import { useColorScheme } from "@/hooks/use-color-scheme";
import { AnimatedPressable } from "@/src/components/AnimatedPressable";
import { useAlert } from "@/src/contexts/AlertContext";
import { api } from "@/src/lib/api";
import { resolveListingImageUrl } from "@/src/lib/resolveImageUrl";

const CONDITIONS = [
	{ key: "new", label: "Neuf", icon: "sparkles-outline" as const },
	{ key: "like_new", label: "Très bon état", icon: "star-outline" as const },
	{ key: "good", label: "Bon état", icon: "thumbs-up-outline" as const },
	{
		key: "fair",
		label: "État correct",
		icon: "remove-circle-outline" as const,
	},
	{ key: "poor", label: "À rénover", icon: "construct-outline" as const },
];

const DURATIONS = [30, 60, 90];

type ImageItem = { id: string; uri: string };

function SectionCard({
	icon,
	title,
	children,
	cardBg,
	borderColor,
	textColor,
	mutedColor,
	primaryColor,
	isDark,
}: any) {
	return (
		<View
			style={[styles.sectionCard, { backgroundColor: cardBg, borderColor }]}
		>
			<View style={styles.sectionHeader}>
				<View
					style={[
						styles.sectionIconBox,
						{ backgroundColor: isDark ? "#0f172a" : "#f1f5f9" },
					]}
				>
					<Ionicons
						name={icon}
						size={16}
						color={isDark ? "#94a3b8" : "#475569"}
					/>
				</View>
				<Text style={[styles.sectionTitle, { color: textColor }]}>{title}</Text>
			</View>
			<View style={styles.sectionBody}>{children}</View>
		</View>
	);
}

function FieldLabel({ label, required, mutedColor }: any) {
	return (
		<Text style={[styles.fieldLabel, { color: mutedColor }]}>
			{label}
			{required && <Text style={{ color: "#ef4444" }}> *</Text>}
		</Text>
	);
}

export default function EditListingScreen() {
	const { id } = useLocalSearchParams<{ id: string }>();
	const isDark = useColorScheme() === "dark";
	const queryClient = useQueryClient();
	const { showSuccess, showError, showAlert, showWarning } = useAlert();

	const bg = isDark ? "#0b1120" : "#f8fafc";
	const cardBg = isDark ? "#1e293b" : "#ffffff";
	const textColor = isDark ? "#e2e8f0" : "#0f172a";
	const mutedColor = isDark ? "#94a3b8" : "#64748b";
	const primaryColor = isDark ? "#3b82f6" : "#1e40af";
	const borderColor = isDark ? "#1e3a5f" : "#e2e8f0";
	const inputBg = isDark ? "#0b1120" : "#f8fafc";

	const { data, isLoading } = useQuery({
		queryKey: ["listing", id],
		queryFn: () => api.get<any>(`/api/listings/${id}?depth=2`),
		enabled: !!id,
	});

	const listing = data?.doc ?? data;

	// ── Form state ─────────────────────────────────────────────────
	const [title, setTitle] = useState("");
	const [description, setDescription] = useState("");
	const [price, setPrice] = useState("");
	const [condition, setCondition] = useState("new");
	const [location, setLocation] = useState("");
	const [duration, setDuration] = useState(30);
	const [attributes, setAttributes] = useState<Record<string, any>>({});
	const [images, setImages] = useState<ImageItem[]>([]);
	const [uploading, setUploading] = useState(false);

	// Initialize once listing is loaded
	useEffect(() => {
		if (!listing) return;
		setTitle(listing.title ?? "");
		setDescription(listing.description ?? "");
		setPrice(String(listing.price ?? ""));
		setCondition(listing.condition ?? "new");
		setLocation(listing.location ?? "");
		setDuration(listing.duration ?? 30);
		setAttributes(listing.attributes ?? {});

		// Normalize images from depth=2 response
		const imgs: ImageItem[] = (listing.images ?? [])
			.map((entry: any) => {
				const media = entry.image ?? entry;
				const rawUrl = media?.url ?? entry?.url ?? "";
				return {
					id: media?.id ?? entry?.id ?? "",
					uri: resolveListingImageUrl({ url: rawUrl }) ?? rawUrl,
				};
			})
			.filter((img: ImageItem) => img.id);
		setImages(imgs);
	}, [listing?.id, listing]);

	const categoryAttributes: any[] = listing?.category?.attributes ?? [];

	// ── Image picker ───────────────────────────────────────────────
	const pickImage = async (fromCamera: boolean) => {
		try {
			if (fromCamera) {
				const { status } = await ImagePicker.requestCameraPermissionsAsync();
				if (status !== "granted") {
					showError(
						"Permission refusée",
						"L'accès à la caméra est nécessaire.",
					);
					return;
				}
			} else {
				const { status } =
					await ImagePicker.requestMediaLibraryPermissionsAsync();
				if (status !== "granted") {
					showError(
						"Permission refusée",
						"L'accès à la galerie est nécessaire.",
					);
					return;
				}
			}

			const result = fromCamera
				? await ImagePicker.launchCameraAsync({
						allowsEditing: true,
						aspect: [4, 3],
						quality: 0.85,
					})
				: await ImagePicker.launchImageLibraryAsync({
						mediaTypes: ["images"],
						allowsEditing: true,
						aspect: [4, 3],
						quality: 0.85,
					});

			if (result.canceled || !result.assets?.[0]) return;
			const asset = result.assets[0];

			setUploading(true);
			const formData = new FormData();
			formData.append("file", {
				uri: asset.uri,
				name: asset.fileName ?? `photo_${Date.now()}.jpg`,
				type: asset.mimeType ?? "image/jpeg",
			} as any);
			formData.append("alt", asset.fileName ?? `photo_${Date.now()}`);

			const uploaded = await api.upload<{ doc: { id: string; url: string } }>(
				"/api/media",
				formData,
			);
			const mediaId = uploaded?.doc?.id;
			const mediaUri = uploaded?.doc?.url ?? asset.uri;
			if (!mediaId) throw new Error("Upload échoué");

			setImages((prev) => [...prev, { id: mediaId, uri: mediaUri }]);
		} catch (err: any) {
			showError("Erreur", err.message ?? "Impossible d'ajouter la photo.");
		} finally {
			setUploading(false);
		}
	};

	const showImagePicker = () => {
		if (images.length >= 10) {
			showWarning("Limite atteinte", "Maximum 10 photos.");
			return;
		}
		showAlert("Ajouter une photo", "Choisissez une source", [
			{ text: "Appareil photo", onPress: () => pickImage(true) },
			{ text: "Galerie", onPress: () => pickImage(false) },
			{ text: "Annuler", style: "cancel" },
		]);
	};

	// ── Save mutation ──────────────────────────────────────────────
	const { mutate: save, isPending } = useMutation({
		mutationFn: () =>
			api.patch(`/api/listings/${id}`, {
				title,
				description,
				price: Number(price),
				condition,
				location,
				duration,
				images: images.map((img) => ({ image: img.id })),
				...(Object.keys(attributes).length > 0 ? { attributes } : {}),
			}),
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: ["listing", id] });
			queryClient.invalidateQueries({ queryKey: ["my-listings"] });
			showSuccess(
				"Annonce modifiée",
				"Vos modifications ont été enregistrées.",
			);
			router.back();
		},
		onError: (err: any) => showError("Erreur", err.message),
	});

	const updateAttr = (slug: string, value: any) =>
		setAttributes((prev) => ({ ...prev, [slug]: value }));

	if (isLoading) {
		return (
			<View style={[styles.loader, { backgroundColor: bg }]}>
				<ActivityIndicator color={primaryColor} size="large" />
			</View>
		);
	}

	const sharedSection = {
		cardBg,
		borderColor,
		textColor,
		mutedColor,
		primaryColor,
		isDark,
	};

	return (
		<SafeAreaView
			edges={["top"]}
			style={[styles.safe, { backgroundColor: bg }]}
		>
			{/* Header */}
			<View style={[styles.header, { borderBottomColor: borderColor }]}>
				<Pressable onPress={() => router.back()} style={styles.backBtn}>
					<Ionicons name="arrow-back" size={22} color={textColor} />
				</Pressable>
				<Text style={[styles.headerTitle, { color: textColor }]}>
					Modifier l'annonce
				</Text>
				<Pressable
					onPress={() => save()}
					disabled={isPending}
					style={[
						styles.saveBtn,
						{ backgroundColor: primaryColor, opacity: isPending ? 0.7 : 1 },
					]}
				>
					{isPending ? (
						<ActivityIndicator size="small" color="#fff" />
					) : (
						<Text style={styles.saveBtnText}>Enregistrer</Text>
					)}
				</Pressable>
			</View>

			<KeyboardAwareScrollView
				style={{ flex: 1 }}
				contentContainerStyle={[styles.scroll, { backgroundColor: bg }]}
				keyboardShouldPersistTaps="handled"
				bottomOffset={20}
				showsVerticalScrollIndicator={false}
			>
				{/* ── Photos ── */}
				<SectionCard icon="images-outline" title="Photos" {...sharedSection}>
					<Text style={[styles.hint, { color: mutedColor }]}>
						La première photo sera la photo principale. Max 10 photos.
					</Text>
					<ScrollView
						horizontal
						showsHorizontalScrollIndicator={false}
						contentContainerStyle={styles.imageList}
					>
						{images.map((img, index) => (
							<View key={img.id} style={styles.imageWrap}>
								<Image
									source={{ uri: img.uri }}
									style={styles.imageThumb}
									contentFit="cover"
								/>
								{index === 0 && (
									<View style={styles.mainBadge}>
										<Text style={styles.mainBadgeText}>Principal</Text>
									</View>
								)}
								<Pressable
									onPress={() =>
										setImages((prev) => prev.filter((_, i) => i !== index))
									}
									style={styles.removeImageBtn}
								>
									<Ionicons name="close" size={12} color="#fff" />
								</Pressable>
							</View>
						))}
						{images.length < 10 && (
							<Pressable
								onPress={showImagePicker}
								disabled={uploading}
								style={[
									styles.addImageBtn,
									{ backgroundColor: inputBg, borderColor },
								]}
							>
								{uploading ? (
									<ActivityIndicator color={primaryColor} />
								) : (
									<>
										<Ionicons
											name="camera-outline"
											size={24}
											color={mutedColor}
										/>
										<Text style={[styles.addImageText, { color: mutedColor }]}>
											Ajouter
										</Text>
									</>
								)}
							</Pressable>
						)}
					</ScrollView>
				</SectionCard>

				{/* ── Détails ── */}
				<SectionCard icon="create-outline" title="Détails" {...sharedSection}>
					{/* Title */}
					<View style={styles.fieldGroup}>
						<FieldLabel label="Titre" required mutedColor={mutedColor} />
						<TextInput
							value={title}
							onChangeText={setTitle}
							placeholder="Titre de l'annonce"
							placeholderTextColor={mutedColor}
							style={[
								styles.input,
								{ backgroundColor: inputBg, borderColor, color: textColor },
							]}
							maxLength={100}
						/>
						<Text style={[styles.charCount, { color: mutedColor }]}>
							{title.length}/100
						</Text>
					</View>

					{/* Description */}
					<View style={styles.fieldGroup}>
						<FieldLabel label="Description" required mutedColor={mutedColor} />
						<TextInput
							value={description}
							onChangeText={setDescription}
							placeholder="Décrivez votre article..."
							placeholderTextColor={mutedColor}
							style={[
								styles.input,
								styles.multiline,
								{ backgroundColor: inputBg, borderColor, color: textColor },
							]}
							multiline
							numberOfLines={5}
						/>
					</View>

					{/* Price */}
					<View style={styles.fieldGroup}>
						<FieldLabel label="Prix (XAF)" required mutedColor={mutedColor} />
						<View
							style={[
								styles.inputRow,
								{ backgroundColor: inputBg, borderColor },
							]}
						>
							<Text style={[styles.currency, { color: mutedColor }]}>XAF</Text>
							<TextInput
								value={price}
								onChangeText={setPrice}
								placeholder="0"
								placeholderTextColor={mutedColor}
								style={[styles.priceInput, { color: textColor }]}
								keyboardType="numeric"
							/>
						</View>
					</View>

					{/* Condition */}
					<View style={styles.fieldGroup}>
						<FieldLabel label="État" mutedColor={mutedColor} />
						<View style={styles.pillRow}>
							{CONDITIONS.map((c) => {
								const active = condition === c.key;
								return (
									<Pressable
										key={c.key}
										onPress={() => setCondition(c.key)}
										style={[
											styles.pill,
											{
												backgroundColor: active ? primaryColor : inputBg,
												borderColor: active ? primaryColor : borderColor,
											},
										]}
									>
										<Ionicons
											name={c.icon}
											size={12}
											color={active ? "#fff" : mutedColor}
										/>
										<Text
											style={[
												styles.pillText,
												{ color: active ? "#fff" : mutedColor },
											]}
										>
											{c.label}
										</Text>
									</Pressable>
								);
							})}
						</View>
					</View>

					{/* Location */}
					<View style={styles.fieldGroup}>
						<FieldLabel label="Localisation" required mutedColor={mutedColor} />
						<View
							style={[
								styles.inputRow,
								{ backgroundColor: inputBg, borderColor },
							]}
						>
							<Ionicons
								name="location-outline"
								size={16}
								color={mutedColor}
								style={{ marginRight: 8 }}
							/>
							<TextInput
								value={location}
								onChangeText={setLocation}
								placeholder="Ex : Douala, Akwa"
								placeholderTextColor={mutedColor}
								style={[styles.rowInput, { color: textColor }]}
							/>
						</View>
					</View>

					{/* Duration */}
					<View style={styles.fieldGroup}>
						<FieldLabel label="Durée de publication" mutedColor={mutedColor} />
						<View style={styles.pillRow}>
							{DURATIONS.map((d) => {
								const active = duration === d;
								return (
									<Pressable
										key={d}
										onPress={() => setDuration(d)}
										style={[
											styles.durationPill,
											{
												backgroundColor: active ? primaryColor : inputBg,
												borderColor: active ? primaryColor : borderColor,
											},
										]}
									>
										<Text
											style={[
												styles.durationNum,
												{ color: active ? "#fff" : textColor },
											]}
										>
											{d}
										</Text>
										<Text
											style={[
												styles.durationUnit,
												{
													color: active ? "rgba(255,255,255,0.75)" : mutedColor,
												},
											]}
										>
											jours
										</Text>
									</Pressable>
								);
							})}
						</View>
					</View>
				</SectionCard>

				{/* ── Attributs dynamiques ── */}
				{categoryAttributes.length > 0 && (
					<SectionCard
						icon="pricetag-outline"
						title={`Caractéristiques — ${listing?.category?.name ?? ""}`}
						{...sharedSection}
					>
						{categoryAttributes.map((attr: any) => (
							<View key={attr.slug} style={styles.fieldGroup}>
								<FieldLabel
									label={attr.name}
									required={attr.required}
									mutedColor={mutedColor}
								/>

								{attr.type === "select" && attr.options ? (
									<View style={styles.pillRow}>
										{attr.options.map((opt: any) => {
											const active = attributes[attr.slug] === opt.value;
											return (
												<Pressable
													key={opt.value}
													onPress={() =>
														updateAttr(attr.slug, active ? "" : opt.value)
													}
													style={[
														styles.pill,
														{
															backgroundColor: active ? primaryColor : inputBg,
															borderColor: active ? primaryColor : borderColor,
														},
													]}
												>
													{active && (
														<Ionicons name="checkmark" size={12} color="#fff" />
													)}
													<Text
														style={[
															styles.pillText,
															{ color: active ? "#fff" : mutedColor },
														]}
													>
														{opt.value}
													</Text>
												</Pressable>
											);
										})}
									</View>
								) : attr.type === "boolean" ? (
									<View style={styles.pillRow}>
										{[
											{ label: "Oui", value: "true" },
											{ label: "Non", value: "false" },
										].map((opt) => {
											const active = attributes[attr.slug] === opt.value;
											return (
												<Pressable
													key={opt.value}
													onPress={() =>
														updateAttr(attr.slug, active ? "" : opt.value)
													}
													style={[
														styles.pill,
														{
															backgroundColor: active ? primaryColor : inputBg,
															borderColor: active ? primaryColor : borderColor,
														},
													]}
												>
													{active && (
														<Ionicons name="checkmark" size={12} color="#fff" />
													)}
													<Text
														style={[
															styles.pillText,
															{ color: active ? "#fff" : mutedColor },
														]}
													>
														{opt.label}
													</Text>
												</Pressable>
											);
										})}
									</View>
								) : (
									<View
										style={[
											styles.inputRow,
											{ backgroundColor: inputBg, borderColor },
										]}
									>
										<TextInput
											value={String(attributes[attr.slug] ?? "")}
											onChangeText={(v) => updateAttr(attr.slug, v)}
											placeholder={attr.name}
											placeholderTextColor={mutedColor}
											keyboardType={
												attr.type === "number" ? "numeric" : "default"
											}
											style={[styles.rowInput, { color: textColor }]}
										/>
									</View>
								)}
							</View>
						))}
					</SectionCard>
				)}

				{/* Submit */}
				<AnimatedPressable
					onPress={() => save()}
					disabled={isPending}
					scaleTo={0.97}
					style={[
						styles.submitBtn,
						{ backgroundColor: primaryColor, opacity: isPending ? 0.7 : 1 },
					]}
				>
					{isPending ? (
						<ActivityIndicator color="#fff" />
					) : (
						<>
							<Ionicons
								name="checkmark-circle-outline"
								size={20}
								color="#fff"
							/>
							<Text style={styles.submitText}>
								Sauvegarder les modifications
							</Text>
						</>
					)}
				</AnimatedPressable>
			</KeyboardAwareScrollView>
		</SafeAreaView>
	);
}

const styles = StyleSheet.create({
	safe: { flex: 1 },
	loader: { flex: 1, alignItems: "center", justifyContent: "center" },

	/* Header */
	header: {
		flexDirection: "row",
		alignItems: "center",
		paddingHorizontal: 16,
		paddingVertical: 12,
		borderBottomWidth: 1,
	},
	backBtn: {
		width: 40,
		height: 40,
		alignItems: "center",
		justifyContent: "center",
	},
	headerTitle: {
		flex: 1,
		fontSize: 18,
		fontFamily: Fonts.displayBold,
		textAlign: "center",
	},
	saveBtn: {
		borderRadius: 10,
		paddingHorizontal: 14,
		paddingVertical: 7,
		minWidth: 40,
		alignItems: "center",
	},
	saveBtnText: {
		color: "#fff",
		fontSize: 13,
		fontFamily: Fonts.displayBold,
	},

	scroll: { padding: 16, gap: 12, paddingBottom: 48 },

	/* Section card */
	sectionCard: {
		borderRadius: 16,
		borderWidth: 1,
		overflow: "hidden",
	},
	sectionHeader: {
		flexDirection: "row",
		alignItems: "center",
		gap: 10,
		paddingHorizontal: 16,
		paddingTop: 14,
		paddingBottom: 10,
	},
	sectionIconBox: {
		width: 30,
		height: 30,
		borderRadius: 8,
		alignItems: "center",
		justifyContent: "center",
	},
	sectionTitle: {
		fontSize: 15,
		fontFamily: Fonts.displayBold,
	},
	sectionBody: {
		paddingHorizontal: 16,
		paddingBottom: 16,
		gap: 14,
	},

	/* Fields */
	fieldGroup: { gap: 6 },
	fieldLabel: {
		fontSize: 13,
		fontFamily: Fonts.bodySemibold,
	},
	hint: {
		fontSize: 12,
		fontFamily: Fonts.body,
		lineHeight: 18,
	},
	input: {
		borderRadius: 10,
		borderWidth: 1.5,
		paddingHorizontal: 12,
		paddingVertical: 11,
		fontSize: 15,
		fontFamily: Fonts.body,
	},
	multiline: {
		minHeight: 120,
		textAlignVertical: "top",
		paddingTop: 11,
	},
	charCount: {
		fontSize: 11,
		fontFamily: Fonts.body,
		alignSelf: "flex-end",
	},
	inputRow: {
		flexDirection: "row",
		alignItems: "center",
		borderRadius: 10,
		borderWidth: 1.5,
		paddingHorizontal: 12,
		paddingVertical: 11,
	},
	rowInput: {
		flex: 1,
		fontSize: 15,
		fontFamily: Fonts.body,
	},
	currency: {
		fontSize: 13,
		fontFamily: Fonts.displayBold,
		marginRight: 8,
	},
	priceInput: {
		flex: 1,
		fontSize: 16,
		fontFamily: Fonts.displayBold,
	},

	/* Pills */
	pillRow: {
		flexDirection: "row",
		flexWrap: "wrap",
		gap: 8,
	},
	pill: {
		flexDirection: "row",
		alignItems: "center",
		gap: 5,
		borderRadius: 20,
		borderWidth: 1.5,
		paddingHorizontal: 12,
		paddingVertical: 7,
	},
	pillText: {
		fontSize: 13,
		fontFamily: Fonts.bodySemibold,
	},

	/* Duration */
	durationPill: {
		flex: 1,
		alignItems: "center",
		borderRadius: 12,
		borderWidth: 1.5,
		paddingVertical: 10,
	},
	durationNum: {
		fontSize: 18,
		fontFamily: Fonts.displayExtrabold,
		lineHeight: 22,
	},
	durationUnit: {
		fontSize: 11,
		fontFamily: Fonts.body,
	},

	/* Images */
	imageList: {
		gap: 10,
		paddingVertical: 4,
	},
	imageWrap: {
		position: "relative",
		width: 90,
		height: 90,
	},
	imageThumb: {
		width: 90,
		height: 90,
		borderRadius: 10,
	},
	mainBadge: {
		position: "absolute",
		bottom: 4,
		left: 4,
		backgroundColor: "rgba(0,0,0,0.55)",
		borderRadius: 6,
		paddingHorizontal: 5,
		paddingVertical: 2,
	},
	mainBadgeText: {
		color: "#fff",
		fontSize: 9,
		fontFamily: Fonts.displayBold,
	},
	removeImageBtn: {
		position: "absolute",
		top: 4,
		right: 4,
		backgroundColor: "rgba(0,0,0,0.6)",
		borderRadius: 10,
		width: 20,
		height: 20,
		alignItems: "center",
		justifyContent: "center",
	},
	addImageBtn: {
		width: 90,
		height: 90,
		borderRadius: 10,
		borderWidth: 1.5,
		borderStyle: "dashed",
		alignItems: "center",
		justifyContent: "center",
		gap: 4,
	},
	addImageText: {
		fontSize: 11,
		fontFamily: Fonts.bodySemibold,
	},

	/* Submit */
	submitBtn: {
		flexDirection: "row",
		alignItems: "center",
		justifyContent: "center",
		gap: 8,
		borderRadius: 14,
		paddingVertical: 15,
		marginTop: 4,
	},
	submitText: {
		color: "#fff",
		fontSize: 16,
		fontFamily: Fonts.displayBold,
	},
});
