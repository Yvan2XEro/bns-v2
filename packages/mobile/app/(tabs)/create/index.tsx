import { Ionicons } from "@expo/vector-icons";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Image } from "expo-image";
import * as ImagePicker from "expo-image-picker";
import * as Location from "expo-location";
import { router } from "expo-router";
import { useRef, useState } from "react";
import {
	ActivityIndicator,
	Alert,
	Dimensions,
	Pressable,
	ScrollView,
	StyleSheet,
	Text,
	TextInput,
	View,
} from "react-native";
import Animated, {
	Easing,
	useAnimatedStyle,
	useSharedValue,
	withTiming,
} from "react-native-reanimated";
import { SafeAreaView } from "react-native-safe-area-context";
import { Fonts } from "@/constants/theme";
import { useColorScheme } from "@/hooks/use-color-scheme";
import { useAlert } from "@/src/contexts/AlertContext";
import { api } from "@/src/lib/api";
import { useAuth } from "@/src/lib/auth";

const STEPS = ["Catégorie", "Détails", "Attributs", "Photos", "Révision"];
const SCREEN_W = Dimensions.get("window").width;

const CONDITIONS: { key: string; label: string; icon: string }[] = [
	{ key: "new", label: "Neuf", icon: "sparkles-outline" },
	{ key: "like_new", label: "Très bon état", icon: "star-outline" },
	{ key: "good", label: "Bon état", icon: "thumbs-up-outline" },
	{ key: "fair", label: "État correct", icon: "remove-circle-outline" },
	{ key: "poor", label: "À rénover", icon: "construct-outline" },
];
const CONDITION_LABELS: Record<string, string> = Object.fromEntries(
	CONDITIONS.map((c) => [c.key, c.label]),
);
const DURATIONS = [30, 60, 90];

// Blue + amber category tints (matches CategoryIcon palette)
const CAT_TINTS = [
	{ bg: "#dbeafe", icon: "#1e40af" },
	{ bg: "#fef3c7", icon: "#b45309" },
	{ bg: "#bfdbfe", icon: "#1e3a8a" },
	{ bg: "#fde68a", icon: "#92400e" },
	{ bg: "#eff6ff", icon: "#2563eb" },
	{ bg: "#fef9c3", icon: "#a16207" },
	{ bg: "#e0f2fe", icon: "#0369a1" },
	{ bg: "#fef3c7", icon: "#d97706" },
	{ bg: "#dbeafe", icon: "#3b82f6" },
	{ bg: "#fde68a", icon: "#b45309" },
];

interface UploadedImage {
	id: string; // Payload media document ID
	uri: string; // local URI for preview
}

interface FormData {
	category: any;
	title: string;
	description: string;
	price: string;
	condition: string;
	duration: number;
	location: string;
	attributes: Record<string, any>;
	images: UploadedImage[];
}

export default function CreateScreen() {
	const isDark = useColorScheme() === "dark";
	const { user } = useAuth();
	const [step, setStep] = useState(0);

	// ── Animations ────────────────────────────────────────────────
	const translateX = useSharedValue(0);
	const opacity = useSharedValue(1);
	const progressAnim = useSharedValue((1 / STEPS.length) * 100);
	const stepRef = useRef(0);

	const goToStep = (next: number) => {
		const dir = next > stepRef.current ? 1 : -1;
		translateX.value = dir * SCREEN_W * 0.4;
		opacity.value = 0;
		stepRef.current = next;
		setStep(next);
		translateX.value = withTiming(0, {
			duration: 320,
			easing: Easing.out(Easing.cubic),
		});
		opacity.value = withTiming(1, {
			duration: 260,
			easing: Easing.out(Easing.ease),
		});
		progressAnim.value = withTiming(((next + 1) / STEPS.length) * 100, {
			duration: 380,
			easing: Easing.out(Easing.cubic),
		});
	};

	const stepAnimStyle = useAnimatedStyle(() => ({
		flex: 1,
		transform: [{ translateX: translateX.value }],
		opacity: opacity.value,
	}));

	const progressBarStyle = useAnimatedStyle(() => ({
		width: `${progressAnim.value}%` as any,
	}));
	const [form, setForm] = useState<FormData>({
		category: null,
		title: "",
		description: "",
		price: "",
		condition: "new",
		duration: 30,
		location: "",
		attributes: {},
		images: [],
	});

	const bg = isDark ? "#0b1120" : "#f8fafc";
	const cardBg = isDark ? "#1e293b" : "#ffffff";
	const textColor = isDark ? "#e2e8f0" : "#0f172a";
	const mutedColor = isDark ? "#94a3b8" : "#64748b";
	const primary = isDark ? "#3b82f6" : "#1e40af";
	const border = isDark ? "#1e3a5f" : "#e2e8f0";
	const accentBg = isDark ? "#111827" : "#eef2ff";
	const inputBg = isDark ? "#162032" : "#f8fafc";

	if (!user) {
		return (
			<SafeAreaView
				edges={["top"]}
				style={[styles.safe, { backgroundColor: accentBg }]}
			>
				<View style={[styles.noUserHeader, { backgroundColor: accentBg }]}>
					<View
						style={[
							styles.sellIconWrap,
							{ backgroundColor: isDark ? "#422006" : "#fef3c7" },
						]}
					>
						<Ionicons name="pricetag" size={22} color="#d97706" />
					</View>
					<Text style={[styles.noUserTitle, { color: textColor }]}>Vendre</Text>
				</View>
				<View style={[styles.contentWrap, { backgroundColor: bg }]}>
					<View style={styles.noUserInner}>
						<View
							style={[
								styles.lockCircle,
								{ backgroundColor: isDark ? "#1e3a5f" : "#dbeafe" },
							]}
						>
							<Ionicons name="lock-closed" size={32} color={primary} />
						</View>
						<Text style={[styles.noUserHeading, { color: textColor }]}>
							Connexion requise
						</Text>
						<Text style={[styles.noUserSub, { color: mutedColor }]}>
							Connectez-vous pour publier une annonce
						</Text>
						<Pressable
							onPress={() => router.push("/auth/login")}
							style={[styles.loginBtn, { backgroundColor: primary }]}
						>
							<Text style={styles.loginBtnText}>Se connecter</Text>
						</Pressable>
					</View>
				</View>
			</SafeAreaView>
		);
	}

	const colors = {
		bg,
		cardBg,
		textColor,
		mutedColor,
		primary,
		border,
		isDark,
		accentBg,
		inputBg,
	};

	const _progressPct = ((step + 1) / STEPS.length) * 100;

	return (
		<SafeAreaView
			edges={["top"]}
			style={[styles.safe, { backgroundColor: accentBg }]}
		>
			{/* ── Header ── */}
			<View style={[styles.header, { backgroundColor: accentBg }]}>
				<Pressable
					onPress={() => (step > 0 ? goToStep(step - 1) : router.back())}
					style={[styles.backBtn, { backgroundColor: cardBg }]}
				>
					<Ionicons name="arrow-back" size={18} color={textColor} />
				</Pressable>

				<View style={styles.headerCenter}>
					<Text style={[styles.headerTitle, { color: textColor }]}>
						Nouvelle annonce
					</Text>
					<Text style={[styles.headerStep, { color: mutedColor }]}>
						Étape {step + 1} sur {STEPS.length} — {STEPS[step]}
					</Text>
				</View>

				<View
					style={[
						styles.stepBadge,
						{ backgroundColor: isDark ? "#1e3a5f" : "#dbeafe" },
					]}
				>
					<Text style={[styles.stepBadgeText, { color: primary }]}>
						{step + 1}/{STEPS.length}
					</Text>
				</View>
			</View>

			{/* ── Progress bar ── */}
			<View
				style={[
					styles.progressTrack,
					{ backgroundColor: isDark ? "#1e293b" : "#e2e8f0" },
				]}
			>
				<Animated.View
					style={[
						styles.progressFill,
						{ backgroundColor: primary },
						progressBarStyle,
					]}
				/>
			</View>

			{/* ── Content ── */}
			<View style={[styles.contentWrap, { backgroundColor: bg }]}>
				<Animated.View style={stepAnimStyle}>
					{step === 0 && (
						<CategoryStep
							form={form}
							setForm={setForm}
							onNext={() => goToStep(1)}
							colors={colors}
						/>
					)}
					{step === 1 && (
						<DetailsStep
							form={form}
							setForm={setForm}
							onNext={() => goToStep(2)}
							colors={colors}
						/>
					)}
					{step === 2 && (
						<AttributesStep
							form={form}
							setForm={setForm}
							onNext={() => goToStep(3)}
							colors={colors}
						/>
					)}
					{step === 3 && (
						<PhotosStep
							form={form}
							setForm={setForm}
							onNext={() => goToStep(4)}
							colors={colors}
						/>
					)}
					{step === 4 && (
						<ReviewStep form={form} setStep={goToStep} colors={colors} />
					)}
				</Animated.View>
			</View>
		</SafeAreaView>
	);
}

// ─── Category Step ─────────────────────────────────────────────────────────────

function CategoryStep({ form, setForm, onNext, colors }: any) {
	const {
		bg,
		cardBg,
		textColor,
		mutedColor,
		primary,
		border,
		isDark,
		inputBg,
	} = colors;
	const [search, setSearch] = useState("");

	const { data } = useQuery({
		queryKey: ["categories"],
		queryFn: () => api.get<{ categories: any[] }>("/api/public/categories"),
		staleTime: 3600000,
	});

	const allCategories = data?.categories ?? [];
	const categories = allCategories.filter((c: any) =>
		c.name.toLowerCase().includes(search.toLowerCase()),
	);

	return (
		<ScrollView
			style={{ flex: 1, backgroundColor: bg }}
			contentContainerStyle={{ padding: 16, paddingBottom: 40 }}
			showsVerticalScrollIndicator={false}
		>
			<Text style={[styles.stepTitle, { color: textColor }]}>
				Dans quelle catégorie ?
			</Text>
			<Text style={[styles.stepSub, { color: mutedColor }]}>
				Choisissez la catégorie qui correspond le mieux à votre article.
			</Text>

			{/* Search */}
			<View
				style={[
					styles.searchWrap,
					{ backgroundColor: inputBg, borderColor: border },
				]}
			>
				<Ionicons name="search-outline" size={16} color={mutedColor} />
				<TextInput
					value={search}
					onChangeText={setSearch}
					placeholder="Rechercher une catégorie..."
					placeholderTextColor={mutedColor}
					style={[styles.searchInput, { color: textColor }]}
				/>
				{search.length > 0 && (
					<Pressable onPress={() => setSearch("")}>
						<Ionicons name="close-circle" size={16} color={mutedColor} />
					</Pressable>
				)}
			</View>

			{/* Grid */}
			<View style={styles.catGrid}>
				{categories.map((cat: any, idx: number) => {
					const tint = CAT_TINTS[idx % CAT_TINTS.length];
					const selected = form.category?.id === cat.id;
					return (
						<Pressable
							key={cat.id}
							onPress={() => {
								setForm((f: any) => ({ ...f, category: cat }));
								onNext();
							}}
							style={[
								styles.catCard,
								{
									backgroundColor: selected
										? isDark
											? "#1e3a5f"
											: "#dbeafe"
										: cardBg,
									borderColor: selected ? primary : border,
									borderWidth: selected ? 2 : 1,
								},
							]}
						>
							<View
								style={[
									styles.catIconCircle,
									{ backgroundColor: selected ? primary : tint.bg },
								]}
							>
								<Ionicons
									name="cube-outline"
									size={20}
									color={selected ? "#fff" : tint.icon}
								/>
							</View>
							<Text
								style={[styles.catName, { color: textColor }]}
								numberOfLines={2}
							>
								{cat.name}
							</Text>
							{selected && (
								<View style={[styles.catCheck, { backgroundColor: primary }]}>
									<Ionicons name="checkmark" size={10} color="#fff" />
								</View>
							)}
						</Pressable>
					);
				})}
			</View>
		</ScrollView>
	);
}

// ─── Details Step ──────────────────────────────────────────────────────────────

function DetailsStep({ form, setForm, onNext, colors }: any) {
	const {
		bg,
		cardBg,
		textColor,
		mutedColor,
		primary,
		border,
		isDark,
		inputBg,
	} = colors;
	const update = (key: string, val: any) =>
		setForm((f: any) => ({ ...f, [key]: val }));
	const canProceed =
		form.title.trim() &&
		form.description.trim() &&
		form.price &&
		form.location.trim();

	return (
		<ScrollView
			style={{ flex: 1, backgroundColor: bg }}
			contentContainerStyle={{ padding: 16, paddingBottom: 40 }}
			showsVerticalScrollIndicator={false}
			keyboardShouldPersistTaps="handled"
		>
			<Text style={[styles.stepTitle, { color: textColor }]}>
				Détails de l'annonce
			</Text>
			<Text style={[styles.stepSub, { color: mutedColor }]}>
				Plus votre annonce est précise, plus elle attire d'acheteurs.
			</Text>

			{/* Card: Titre + Description */}
			<View
				style={[
					styles.fieldCard,
					{ backgroundColor: cardBg, borderColor: border },
				]}
			>
				<FieldHeader
					icon="text-outline"
					label="Titre de l'annonce"
					required
					colors={colors}
				/>
				<TextInput
					value={form.title}
					onChangeText={(v) => update("title", v)}
					placeholder="Ex : iPhone 13 Pro 256 Go, noir..."
					placeholderTextColor={mutedColor}
					style={[
						styles.fieldInput,
						{ color: textColor, borderColor: border, backgroundColor: inputBg },
					]}
					maxLength={100}
				/>
				<Text style={[styles.charCount, { color: mutedColor }]}>
					{form.title.length}/100
				</Text>

				<View style={[styles.fieldDivider, { backgroundColor: border }]} />

				<FieldHeader
					icon="document-text-outline"
					label="Description"
					required
					colors={colors}
				/>
				<TextInput
					value={form.description}
					onChangeText={(v) => update("description", v)}
					placeholder="Décrivez l'état, les caractéristiques, les accessoires inclus..."
					placeholderTextColor={mutedColor}
					style={[
						styles.fieldInput,
						styles.multiline,
						{ color: textColor, borderColor: border, backgroundColor: inputBg },
					]}
					multiline
					numberOfLines={5}
					textAlignVertical="top"
				/>
			</View>

			{/* Card: Prix */}
			<View
				style={[
					styles.fieldCard,
					{ backgroundColor: cardBg, borderColor: border },
				]}
			>
				<FieldHeader
					icon="cash-outline"
					label="Prix"
					required
					colors={colors}
				/>
				<View style={styles.priceRow}>
					<TextInput
						value={form.price}
						onChangeText={(v) => update("price", v)}
						placeholder="0"
						placeholderTextColor={mutedColor}
						style={[
							styles.priceInput,
							{
								color: textColor,
								borderColor: border,
								backgroundColor: inputBg,
							},
						]}
						keyboardType="numeric"
					/>
					<View
						style={[
							styles.priceBadge,
							{ backgroundColor: isDark ? "#422006" : "#fef3c7" },
						]}
					>
						<Text style={[styles.priceBadgeText, { color: "#b45309" }]}>
							XAF
						</Text>
					</View>
				</View>
			</View>

			{/* Card: État */}
			<View
				style={[
					styles.fieldCard,
					{ backgroundColor: cardBg, borderColor: border },
				]}
			>
				<FieldHeader
					icon="shield-checkmark-outline"
					label="État de l'article"
					colors={colors}
				/>
				<View style={styles.conditionWrap}>
					{CONDITIONS.map((c) => {
						const active = form.condition === c.key;
						return (
							<Pressable
								key={c.key}
								onPress={() => update("condition", c.key)}
								style={[
									styles.conditionPill,
									{
										backgroundColor: active ? primary : inputBg,
										borderColor: active ? primary : border,
									},
								]}
							>
								<Ionicons
									name={c.icon as any}
									size={13}
									color={active ? "#fff" : mutedColor}
								/>
								<Text
									style={[
										styles.conditionText,
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

			{/* Card: Localisation */}
			<View
				style={[
					styles.fieldCard,
					{ backgroundColor: cardBg, borderColor: border },
				]}
			>
				<FieldHeader
					icon="location-outline"
					label="Localisation"
					required
					colors={colors}
				/>
				<View
					style={[
						styles.locationRow,
						{ backgroundColor: inputBg, borderColor: border },
					]}
				>
					<Ionicons name="map-outline" size={16} color={mutedColor} />
					<TextInput
						value={form.location}
						onChangeText={(v) => update("location", v)}
						placeholder="Ex : Douala, Akwa"
						placeholderTextColor={mutedColor}
						style={[styles.locationInput, { color: textColor }]}
					/>
				</View>
				<GpsButton
					onLocation={(loc: string) => update("location", loc)}
					colors={colors}
				/>
			</View>

			{/* Card: Durée */}
			<View
				style={[
					styles.fieldCard,
					{ backgroundColor: cardBg, borderColor: border },
				]}
			>
				<FieldHeader
					icon="time-outline"
					label="Durée de publication"
					colors={colors}
				/>
				<View style={styles.durationRow}>
					{DURATIONS.map((d) => {
						const active = form.duration === d;
						return (
							<Pressable
								key={d}
								onPress={() => update("duration", d)}
								style={[
									styles.durationPill,
									{
										backgroundColor: active ? primary : inputBg,
										borderColor: active ? primary : border,
										flex: 1,
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
										{ color: active ? "rgba(255,255,255,0.8)" : mutedColor },
									]}
								>
									jours
								</Text>
							</Pressable>
						);
					})}
				</View>
			</View>

			<NextButton
				label="Continuer"
				onPress={canProceed ? onNext : undefined}
				active={!!canProceed}
				colors={colors}
			/>
		</ScrollView>
	);
}

// ─── Attributes Step ───────────────────────────────────────────────────────────

function AttributesStep({ form, onNext, colors }: any) {
	const { bg, textColor, mutedColor, primary } = colors;
	const attributes = form.category?.attributes ?? [];

	if (attributes.length === 0) {
		onNext();
		return null;
	}

	return (
		<ScrollView
			style={{ flex: 1, backgroundColor: bg }}
			contentContainerStyle={{ padding: 16, paddingBottom: 40 }}
		>
			<Text style={[styles.stepTitle, { color: textColor }]}>Attributs</Text>
			<Text style={[styles.stepSub, { color: mutedColor }]}>
				Ces informations aident les acheteurs à trouver votre annonce.
			</Text>
			<NextButton label="Continuer" onPress={onNext} active colors={colors} />
		</ScrollView>
	);
}

// ─── Photos Step ───────────────────────────────────────────────────────────────

function PhotosStep({ form, setForm, onNext, colors }: any) {
	const { bg, cardBg, textColor, mutedColor, primary, border, isDark } = colors;
	const [uploading, setUploading] = useState(false);

	const pickImage = async (fromCamera: boolean) => {
		try {
			if (fromCamera) {
				const { status } = await ImagePicker.requestCameraPermissionsAsync();
				if (status !== "granted") {
					Alert.alert(
						"Permission refusée",
						"L'accès à la caméra est nécessaire.",
					);
					return;
				}
			} else {
				const { status } =
					await ImagePicker.requestMediaLibraryPermissionsAsync();
				if (status !== "granted") {
					Alert.alert(
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
						mediaTypes: ImagePicker.MediaTypeOptions.Images,
						allowsEditing: true,
						aspect: [4, 3],
						quality: 0.85,
					});

			if (result.canceled || !result.assets?.[0]) return;
			const asset = result.assets[0];

			setUploading(true);
			try {
				const formData = new FormData();
				formData.append("file", {
					uri: asset.uri,
					name: asset.fileName ?? `photo_${Date.now()}.jpg`,
					type: asset.mimeType ?? "image/jpeg",
				} as any);

				const uploaded = await api.upload<{ doc: { id: string; url: string } }>(
					"/api/media",
					formData,
				);
				const mediaId = uploaded?.doc?.id;
				const mediaUri = uploaded?.doc?.url ?? asset.uri;

				if (!mediaId) throw new Error("Upload échoué");

				setForm((f: any) => ({
					...f,
					images: [...f.images, { id: mediaId, uri: mediaUri }],
				}));
			} finally {
				setUploading(false);
			}
		} catch (err: any) {
			setUploading(false);
			Alert.alert("Erreur", err.message ?? "Impossible d'ajouter la photo.");
		}
	};

	const showPicker = () => {
		if (form.images.length >= 10) {
			Alert.alert("Limite atteinte", "Vous pouvez ajouter jusqu'à 10 photos.");
			return;
		}
		Alert.alert("Ajouter une photo", "Choisissez une source", [
			{ text: "Appareil photo", onPress: () => pickImage(true) },
			{ text: "Galerie", onPress: () => pickImage(false) },
			{ text: "Annuler", style: "cancel" },
		]);
	};

	const removeImage = (index: number) => {
		setForm((f: any) => ({
			...f,
			images: f.images.filter((_: any, i: number) => i !== index),
		}));
	};

	return (
		<ScrollView
			style={{ flex: 1, backgroundColor: bg }}
			contentContainerStyle={{ padding: 16, paddingBottom: 40 }}
		>
			<Text style={[styles.stepTitle, { color: textColor }]}>
				Photos de l'annonce
			</Text>
			<Text style={[styles.stepSub, { color: mutedColor }]}>
				Ajoutez jusqu'à 10 photos. La première sera la photo principale.
			</Text>

			{/* Tip card */}
			<View
				style={[
					styles.tipCard,
					{
						backgroundColor: isDark ? "#1e3a5f" : "#dbeafe",
						borderColor: isDark ? "#2d5a9e" : "#bfdbfe",
					},
				]}
			>
				<Ionicons name="information-circle-outline" size={16} color={primary} />
				<Text style={[styles.tipText, { color: primary }]}>
					Des photos nettes et bien éclairées augmentent vos chances de vente.
				</Text>
			</View>

			<View style={styles.photosGrid}>
				{form.images.map((img: UploadedImage, i: number) => (
					<View
						key={img.id}
						style={[
							styles.photoThumb,
							{ backgroundColor: cardBg, borderColor: border },
						]}
					>
						<Image
							source={{ uri: img.uri }}
							style={{ width: "100%", height: "100%", borderRadius: 12 }}
							contentFit="cover"
						/>
						{i === 0 && (
							<View
								style={[styles.photoPrimaryBadge, { backgroundColor: primary }]}
							>
								<Text style={styles.photoPrimaryText}>Principal</Text>
							</View>
						)}
						<Pressable
							onPress={() => removeImage(i)}
							style={styles.photoDeleteBtn}
						>
							<Ionicons name="close-circle" size={22} color="#ef4444" />
						</Pressable>
					</View>
				))}

				{form.images.length < 10 && (
					<Pressable
						style={[
							styles.addPhotoBtn,
							{
								backgroundColor: isDark ? "#162032" : "#f0f7ff",
								borderColor: primary,
							},
						]}
						onPress={showPicker}
						disabled={uploading}
					>
						{uploading ? (
							<ActivityIndicator color={primary} />
						) : (
							<>
								<View
									style={[
										styles.addIconCircle,
										{ backgroundColor: isDark ? "#1e3a5f" : "#dbeafe" },
									]}
								>
									<Ionicons name="add" size={24} color={primary} />
								</View>
								<Text style={[styles.addPhotoText, { color: primary }]}>
									Ajouter
								</Text>
							</>
						)}
					</Pressable>
				)}
			</View>

			<NextButton label="Continuer" onPress={onNext} active colors={colors} />
		</ScrollView>
	);
}

// ─── Review Step ───────────────────────────────────────────────────────────────

function ReviewStep({ form, setStep, colors }: any) {
	const { user } = useAuth();
	const { showSuccess, showError } = useAlert();
	const { bg, cardBg, textColor, mutedColor, primary, border, isDark } = colors;

	const { mutate: publish, isPending } = useMutation({
		mutationFn: async () =>
			api.post<any>("/api/listings", {
				title: form.title,
				description: form.description,
				price: Number(form.price),
				condition: form.condition,
				location: form.location,
				category: form.category?.id,
				seller: user?.id,
				images: form.images.map((img: UploadedImage) => ({ image: img.id })),
			}),
		onSuccess: () => {
			showSuccess(
				"Annonce publiée !",
				"Votre annonce est en attente de validation.",
			);
			router.push("/(tabs)/account");
		},
		onError: (err: any) => {
			showError("Erreur", err.message ?? "Une erreur est survenue");
		},
	});

	const rows = [
		{
			label: "Catégorie",
			icon: "grid-outline",
			value: form.category?.name ?? "—",
			step: 0,
		},
		{ label: "Titre", icon: "text-outline", value: form.title || "—", step: 1 },
		{
			label: "Prix",
			icon: "cash-outline",
			value: form.price
				? `${Number.parseInt(form.price, 10).toLocaleString()} XAF`
				: "—",
			step: 1,
		},
		{
			label: "État",
			icon: "shield-checkmark-outline",
			value: CONDITION_LABELS[form.condition] ?? form.condition,
			step: 1,
		},
		{
			label: "Localisation",
			icon: "location-outline",
			value: form.location || "—",
			step: 1,
		},
		{
			label: "Photos",
			icon: "camera-outline",
			value: `${form.images.length} photo(s)`,
			step: 3,
		},
	];

	return (
		<ScrollView
			style={{ flex: 1, backgroundColor: bg }}
			contentContainerStyle={{ padding: 16, paddingBottom: 40 }}
		>
			<Text style={[styles.stepTitle, { color: textColor }]}>
				Vérifier et publier
			</Text>
			<Text style={[styles.stepSub, { color: mutedColor }]}>
				Relisez votre annonce avant de la publier.
			</Text>

			<View
				style={[
					styles.reviewCard,
					{ backgroundColor: cardBg, borderColor: border },
				]}
			>
				{rows.map((row, i) => (
					<View
						key={row.label}
						style={[
							styles.reviewRow,
							{
								borderBottomColor: i < rows.length - 1 ? border : "transparent",
							},
						]}
					>
						<View
							style={[
								styles.reviewIconWrap,
								{ backgroundColor: isDark ? "#1e3a5f" : "#dbeafe" },
							]}
						>
							<Ionicons name={row.icon as any} size={14} color={primary} />
						</View>
						<View style={{ flex: 1 }}>
							<Text style={[styles.reviewLabel, { color: mutedColor }]}>
								{row.label}
							</Text>
							<Text
								style={[styles.reviewValue, { color: textColor }]}
								numberOfLines={1}
							>
								{row.value}
							</Text>
						</View>
						<Pressable
							onPress={() => setStep(row.step)}
							style={[
								styles.editPill,
								{ backgroundColor: isDark ? "#162032" : "#f0f7ff" },
							]}
						>
							<Text style={[styles.editPillText, { color: primary }]}>
								Modifier
							</Text>
						</Pressable>
					</View>
				))}
			</View>

			{/* Publish button */}
			<Pressable
				onPress={() => publish()}
				disabled={isPending}
				style={[styles.publishBtn, { backgroundColor: "#f59e0b" }]}
			>
				{isPending ? (
					<ActivityIndicator color="#fff" />
				) : (
					<>
						<Ionicons name="rocket-outline" size={20} color="#fff" />
						<Text style={styles.publishBtnText}>Publier l'annonce</Text>
					</>
				)}
			</Pressable>

			<Text style={[styles.publishNote, { color: mutedColor }]}>
				Votre annonce sera vérifiée avant publication (moins de 24h).
			</Text>
		</ScrollView>
	);
}

// ─── Shared sub-components ─────────────────────────────────────────────────────

function GpsButton({ onLocation, colors }: any) {
	const { primary, mutedColor, isDark } = colors;
	const [loading, setLoading] = useState(false);

	const getLocation = async () => {
		setLoading(true);
		try {
			const { status } = await Location.requestForegroundPermissionsAsync();
			if (status !== "granted") {
				Alert.alert(
					"Permission refusée",
					"L'accès à la localisation est nécessaire.",
				);
				return;
			}
			const pos = await Location.getCurrentPositionAsync({
				accuracy: Location.Accuracy.Balanced,
			});
			const [result] = await Location.reverseGeocodeAsync({
				latitude: pos.coords.latitude,
				longitude: pos.coords.longitude,
			});
			if (result) {
				const parts = [
					result.district ?? result.subregion,
					result.city ?? result.region,
				].filter(Boolean);
				onLocation(parts.join(", ") || (result.formattedAddress ?? ""));
			}
		} catch (_err: any) {
			Alert.alert("Erreur", "Impossible d'obtenir la localisation.");
		} finally {
			setLoading(false);
		}
	};

	return (
		<Pressable
			onPress={getLocation}
			disabled={loading}
			style={[
				styles.gpsBtn,
				{ backgroundColor: isDark ? "#1e3a5f" : "#dbeafe" },
			]}
		>
			{loading ? (
				<ActivityIndicator size="small" color={primary} />
			) : (
				<Ionicons name="navigate-outline" size={14} color={primary} />
			)}
			<Text style={[styles.gpsBtnText, { color: primary }]}>
				{loading ? "Localisation..." : "Utiliser ma position"}
			</Text>
		</Pressable>
	);
}

function FieldHeader({ icon, label, required, colors }: any) {
	const { textColor, mutedColor, primary } = colors;
	return (
		<View style={styles.fieldHeaderRow}>
			<Ionicons name={icon} size={14} color={primary} />
			<Text style={[styles.fieldLabel, { color: textColor }]}>
				{label}
				{required && <Text style={{ color: "#ef4444" }}> *</Text>}
			</Text>
		</View>
	);
}

function NextButton({ label, onPress, active, colors }: any) {
	const { primary, mutedColor, isDark } = colors;
	return (
		<Pressable
			onPress={active ? onPress : undefined}
			style={[
				styles.nextBtn,
				{
					backgroundColor: active ? primary : isDark ? "#1e293b" : "#e2e8f0",
					opacity: active ? 1 : 0.6,
				},
			]}
		>
			<Text
				style={[styles.nextBtnText, { color: active ? "#fff" : mutedColor }]}
			>
				{label}
			</Text>
			<Ionicons
				name="arrow-forward"
				size={18}
				color={active ? "#fff" : mutedColor}
			/>
		</Pressable>
	);
}

// ─── Styles ────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
	safe: { flex: 1 },

	/* ── No-user ── */
	noUserHeader: {
		flexDirection: "row",
		alignItems: "center",
		gap: 12,
		paddingHorizontal: 16,
		paddingTop: 6,
		paddingBottom: 14,
	},
	sellIconWrap: {
		width: 44,
		height: 44,
		borderRadius: 14,
		alignItems: "center",
		justifyContent: "center",
	},
	noUserTitle: {
		fontSize: 24,
		fontFamily: Fonts.displayExtrabold,
		letterSpacing: -0.4,
	},
	contentWrap: {
		flex: 1,
		borderTopLeftRadius: 20,
		borderTopRightRadius: 20,
		overflow: "hidden",
	},
	noUserInner: {
		flex: 1,
		alignItems: "center",
		justifyContent: "center",
		padding: 32,
	},
	lockCircle: {
		width: 80,
		height: 80,
		borderRadius: 24,
		alignItems: "center",
		justifyContent: "center",
		marginBottom: 20,
	},
	noUserHeading: {
		fontSize: 22,
		fontFamily: Fonts.displayBold,
		marginBottom: 8,
		textAlign: "center",
	},
	noUserSub: {
		fontSize: 14,
		fontFamily: Fonts.body,
		textAlign: "center",
		lineHeight: 20,
		marginBottom: 24,
	},
	loginBtn: {
		borderRadius: 14,
		paddingHorizontal: 32,
		paddingVertical: 14,
	},
	loginBtnText: {
		color: "#fff",
		fontSize: 15,
		fontFamily: Fonts.displayBold,
	},

	/* ── Header ── */
	header: {
		flexDirection: "row",
		alignItems: "center",
		gap: 12,
		paddingHorizontal: 16,
		paddingTop: 6,
		paddingBottom: 12,
	},
	backBtn: {
		width: 36,
		height: 36,
		borderRadius: 10,
		alignItems: "center",
		justifyContent: "center",
		shadowColor: "#000",
		shadowOffset: { width: 0, height: 1 },
		shadowOpacity: 0.08,
		shadowRadius: 4,
		elevation: 2,
	},
	headerCenter: { flex: 1 },
	headerTitle: {
		fontSize: 17,
		fontFamily: Fonts.displayBold,
		letterSpacing: -0.2,
	},
	headerStep: {
		fontSize: 11,
		fontFamily: Fonts.body,
		marginTop: 1,
	},
	stepBadge: {
		borderRadius: 8,
		paddingHorizontal: 8,
		paddingVertical: 4,
	},
	stepBadgeText: {
		fontSize: 12,
		fontFamily: Fonts.displayBold,
	},

	/* ── Progress ── */
	progressTrack: {
		height: 3,
	},
	progressFill: {
		height: 3,
		borderRadius: 2,
	},

	/* ── Step headings ── */
	stepTitle: {
		fontSize: 22,
		fontFamily: Fonts.displayBold,
		letterSpacing: -0.3,
		marginBottom: 6,
	},
	stepSub: {
		fontSize: 13,
		fontFamily: Fonts.body,
		lineHeight: 20,
		marginBottom: 20,
	},

	/* ── Category ── */
	searchWrap: {
		flexDirection: "row",
		alignItems: "center",
		gap: 8,
		borderRadius: 12,
		borderWidth: 1.5,
		paddingHorizontal: 12,
		paddingVertical: 10,
		marginBottom: 16,
	},
	searchInput: {
		flex: 1,
		fontSize: 14,
		fontFamily: Fonts.body,
	},
	catGrid: {
		flexDirection: "row",
		flexWrap: "wrap",
		gap: 10,
	},
	catCard: {
		width: "30%",
		aspectRatio: 0.95,
		borderRadius: 14,
		alignItems: "center",
		justifyContent: "center",
		padding: 10,
		gap: 8,
		position: "relative",
	},
	catIconCircle: {
		width: 44,
		height: 44,
		borderRadius: 14,
		alignItems: "center",
		justifyContent: "center",
	},
	catName: {
		fontSize: 11,
		fontFamily: Fonts.bodySemibold,
		textAlign: "center",
		lineHeight: 15,
	},
	catCheck: {
		position: "absolute",
		top: 6,
		right: 6,
		width: 18,
		height: 18,
		borderRadius: 9,
		alignItems: "center",
		justifyContent: "center",
	},

	/* ── Field card ── */
	fieldCard: {
		borderRadius: 16,
		borderWidth: 1,
		padding: 14,
		marginBottom: 12,
		gap: 10,
	},
	fieldHeaderRow: {
		flexDirection: "row",
		alignItems: "center",
		gap: 6,
	},
	fieldLabel: {
		fontSize: 13,
		fontFamily: Fonts.bodySemibold,
	},
	fieldDivider: {
		height: 1,
		marginVertical: 2,
	},
	fieldInput: {
		borderWidth: 1,
		borderRadius: 10,
		paddingHorizontal: 12,
		paddingVertical: 10,
		fontSize: 15,
		fontFamily: Fonts.body,
	},
	multiline: {
		height: 110,
		textAlignVertical: "top",
		paddingTop: 10,
	},
	charCount: {
		fontSize: 11,
		fontFamily: Fonts.body,
		textAlign: "right",
		marginTop: -6,
	},

	/* ── Price ── */
	priceRow: {
		flexDirection: "row",
		alignItems: "center",
		gap: 10,
	},
	priceInput: {
		flex: 1,
		borderWidth: 1,
		borderRadius: 10,
		paddingHorizontal: 12,
		paddingVertical: 10,
		fontSize: 18,
		fontFamily: Fonts.displayBold,
	},
	priceBadge: {
		borderRadius: 10,
		paddingHorizontal: 14,
		paddingVertical: 12,
	},
	priceBadgeText: {
		fontSize: 14,
		fontFamily: Fonts.displayBold,
	},

	/* ── Condition ── */
	conditionWrap: {
		flexDirection: "row",
		flexWrap: "wrap",
		gap: 8,
	},
	conditionPill: {
		flexDirection: "row",
		alignItems: "center",
		gap: 5,
		borderRadius: 20,
		borderWidth: 1.5,
		paddingHorizontal: 12,
		paddingVertical: 7,
	},
	conditionText: {
		fontSize: 12,
		fontFamily: Fonts.bodySemibold,
	},

	/* ── Location ── */
	locationRow: {
		flexDirection: "row",
		alignItems: "center",
		gap: 8,
		borderWidth: 1,
		borderRadius: 10,
		paddingHorizontal: 12,
		paddingVertical: 10,
	},
	locationInput: {
		flex: 1,
		fontSize: 15,
		fontFamily: Fonts.body,
	},

	/* ── Duration ── */
	durationRow: {
		flexDirection: "row",
		gap: 8,
	},
	durationPill: {
		borderRadius: 12,
		borderWidth: 1.5,
		paddingVertical: 12,
		alignItems: "center",
		justifyContent: "center",
	},
	durationNum: {
		fontSize: 18,
		fontFamily: Fonts.displayBold,
	},
	durationUnit: {
		fontSize: 11,
		fontFamily: Fonts.body,
	},

	/* ── Tip ── */
	tipCard: {
		flexDirection: "row",
		alignItems: "flex-start",
		gap: 8,
		borderRadius: 12,
		borderWidth: 1,
		padding: 12,
		marginBottom: 16,
	},
	tipText: {
		flex: 1,
		fontSize: 12,
		fontFamily: Fonts.body,
		lineHeight: 18,
	},

	/* ── Photos ── */
	photosGrid: {
		flexDirection: "row",
		flexWrap: "wrap",
		gap: 10,
		marginBottom: 8,
	},
	photoThumb: {
		width: 100,
		height: 100,
		borderRadius: 12,
		borderWidth: 1,
		alignItems: "center",
		justifyContent: "center",
	},
	photoIndex: {
		fontSize: 20,
		fontFamily: Fonts.displayBold,
	},
	addPhotoBtn: {
		width: 100,
		height: 100,
		borderRadius: 12,
		borderWidth: 2,
		borderStyle: "dashed",
		alignItems: "center",
		justifyContent: "center",
		gap: 6,
	},
	addIconCircle: {
		width: 40,
		height: 40,
		borderRadius: 12,
		alignItems: "center",
		justifyContent: "center",
	},
	addPhotoText: {
		fontSize: 11,
		fontFamily: Fonts.bodySemibold,
	},
	photoPrimaryBadge: {
		position: "absolute",
		bottom: 6,
		left: 6,
		borderRadius: 6,
		paddingHorizontal: 6,
		paddingVertical: 2,
	},
	photoPrimaryText: {
		color: "#fff",
		fontSize: 9,
		fontFamily: Fonts.displayBold,
	},
	photoDeleteBtn: {
		position: "absolute",
		top: 4,
		right: 4,
	},
	gpsBtn: {
		flexDirection: "row",
		alignItems: "center",
		gap: 6,
		alignSelf: "flex-start",
		borderRadius: 8,
		paddingHorizontal: 10,
		paddingVertical: 6,
		marginTop: 2,
	},
	gpsBtnText: {
		fontSize: 12,
		fontFamily: Fonts.bodySemibold,
	},

	/* ── Review ── */
	reviewCard: {
		borderRadius: 16,
		borderWidth: 1,
		overflow: "hidden",
		marginBottom: 20,
	},
	reviewRow: {
		flexDirection: "row",
		alignItems: "center",
		gap: 10,
		paddingHorizontal: 14,
		paddingVertical: 13,
		borderBottomWidth: 1,
	},
	reviewIconWrap: {
		width: 32,
		height: 32,
		borderRadius: 9,
		alignItems: "center",
		justifyContent: "center",
	},
	reviewLabel: {
		fontSize: 11,
		fontFamily: Fonts.bodySemibold,
		letterSpacing: 0.3,
		textTransform: "uppercase",
		marginBottom: 1,
	},
	reviewValue: {
		fontSize: 14,
		fontFamily: Fonts.body,
	},
	editPill: {
		borderRadius: 8,
		paddingHorizontal: 10,
		paddingVertical: 5,
	},
	editPillText: {
		fontSize: 12,
		fontFamily: Fonts.bodySemibold,
	},
	publishBtn: {
		flexDirection: "row",
		alignItems: "center",
		justifyContent: "center",
		gap: 10,
		borderRadius: 16,
		paddingVertical: 16,
		shadowColor: "#f59e0b",
		shadowOffset: { width: 0, height: 4 },
		shadowOpacity: 0.35,
		shadowRadius: 10,
		elevation: 6,
	},
	publishBtnText: {
		color: "#fff",
		fontSize: 17,
		fontFamily: Fonts.displayBold,
	},
	publishNote: {
		fontSize: 12,
		fontFamily: Fonts.body,
		textAlign: "center",
		marginTop: 12,
		lineHeight: 18,
	},

	/* ── Next button ── */
	nextBtn: {
		flexDirection: "row",
		alignItems: "center",
		justifyContent: "center",
		gap: 8,
		borderRadius: 16,
		paddingVertical: 15,
		marginTop: 8,
	},
	nextBtnText: {
		fontSize: 16,
		fontFamily: Fonts.displayBold,
	},
});
