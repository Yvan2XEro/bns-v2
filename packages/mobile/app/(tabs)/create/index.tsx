import { Ionicons } from "@expo/vector-icons";
import { useMutation, useQuery } from "@tanstack/react-query";
import { router } from "expo-router";
import React, { useState } from "react";
import {
	ActivityIndicator,
	Alert,
	Pressable,
	ScrollView,
	StyleSheet,
	Text,
	TextInput,
	View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useColorScheme } from "@/hooks/use-color-scheme";
import { api } from "@/src/lib/api";
import { useAuth } from "@/src/lib/auth";

const STEPS = ["Catégorie", "Détails", "Attributs", "Photos", "Révision"];

const CONDITIONS = ["new", "like_new", "good", "fair", "poor"];
const CONDITION_LABELS: Record<string, string> = {
	new: "Neuf",
	like_new: "Très bon état",
	good: "Bon état",
	fair: "État correct",
	poor: "À rénover",
};
const DURATIONS = [30, 60, 90];

interface FormData {
	category: any;
	title: string;
	description: string;
	price: string;
	condition: string;
	duration: number;
	location: string;
	attributes: Record<string, any>;
	images: string[];
}

export default function CreateScreen() {
	const isDark = useColorScheme() === "dark";
	const { user } = useAuth();
	const [step, setStep] = useState(0);
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
	const primaryColor = isDark ? "#3b82f6" : "#1e40af";
	const borderColor = isDark ? "#1e3a5f" : "#e2e8f0";

	if (!user) {
		return (
			<SafeAreaView style={[styles.safe, { backgroundColor: bg }]}>
				<View style={styles.center}>
					<Text style={{ fontSize: 48, marginBottom: 16 }}>🔒</Text>
					<Text style={[styles.title, { color: textColor }]}>
						Connexion requise
					</Text>
					<Text style={[styles.subtitle, { color: mutedColor }]}>
						Connectez-vous pour publier une annonce
					</Text>
					<Pressable
						onPress={() => router.push("/auth/login")}
						style={[styles.primaryBtn, { backgroundColor: primaryColor }]}
					>
						<Text style={styles.primaryBtnText}>Se connecter</Text>
					</Pressable>
				</View>
			</SafeAreaView>
		);
	}

	const colors = {
		bg,
		cardBg,
		textColor,
		mutedColor,
		primaryColor,
		borderColor,
		isDark,
	};

	return (
		<SafeAreaView style={[styles.safe, { backgroundColor: bg }]}>
			{/* Header */}
			<View style={[styles.header, { borderBottomColor: borderColor }]}>
				<Pressable
					onPress={() => (step > 0 ? setStep(step - 1) : router.back())}
					style={styles.backBtn}
				>
					<Ionicons name="arrow-back" size={22} color={textColor} />
				</Pressable>
				<Text style={[styles.headerTitle, { color: textColor }]}>
					Publier une annonce
				</Text>
				<View style={{ width: 40 }} />
			</View>

			{/* Step Indicator */}
			<View style={styles.stepIndicator}>
				{STEPS.map((s, i) => (
					<React.Fragment key={s}>
						<View style={styles.stepItem}>
							<View
								style={[
									styles.stepCircle,
									{
										backgroundColor:
											i <= step ? primaryColor : isDark ? "#1e293b" : "#e2e8f0",
										borderColor: i <= step ? primaryColor : borderColor,
									},
								]}
							>
								{i < step ? (
									<Ionicons name="checkmark" size={14} color="#fff" />
								) : (
									<Text
										style={[
											styles.stepNum,
											{ color: i === step ? "#fff" : mutedColor },
										]}
									>
										{i + 1}
									</Text>
								)}
							</View>
							{i === step && (
								<Text style={[styles.stepLabel, { color: primaryColor }]}>
									{s}
								</Text>
							)}
						</View>
						{i < STEPS.length - 1 && (
							<View
								style={[
									styles.stepLine,
									{
										backgroundColor:
											i < step ? primaryColor : isDark ? "#1e293b" : "#e2e8f0",
									},
								]}
							/>
						)}
					</React.Fragment>
				))}
			</View>

			{/* Steps */}
			{step === 0 && (
				<CategoryStep
					form={form}
					setForm={setForm}
					onNext={() => setStep(1)}
					colors={colors}
				/>
			)}
			{step === 1 && (
				<DetailsStep
					form={form}
					setForm={setForm}
					onNext={() => setStep(2)}
					colors={colors}
				/>
			)}
			{step === 2 && (
				<AttributesStep
					form={form}
					setForm={setForm}
					onNext={() => setStep(3)}
					colors={colors}
				/>
			)}
			{step === 3 && (
				<PhotosStep
					form={form}
					setForm={setForm}
					onNext={() => setStep(4)}
					colors={colors}
				/>
			)}
			{step === 4 && (
				<ReviewStep form={form} setStep={setStep} colors={colors} />
			)}
		</SafeAreaView>
	);
}

// ─── Step Components ──────────────────────────────────────────────────────────

function CategoryStep({ form, setForm, onNext, colors }: any) {
	const { data } = useQuery({
		queryKey: ["categories"],
		queryFn: () => api.get<{ docs: any[] }>("/api/public/categories?depth=1"),
		staleTime: 3600000,
	});
	const [search, setSearch] = useState("");
	const { bg, cardBg, textColor, mutedColor, primaryColor, borderColor } =
		colors;

	const allCategories = data?.docs ?? [];
	const categories = allCategories.filter((c: any) =>
		c.name.toLowerCase().includes(search.toLowerCase()),
	);

	return (
		<ScrollView
			style={{ flex: 1, backgroundColor: bg }}
			contentContainerStyle={{ padding: 16 }}
			showsVerticalScrollIndicator={false}
		>
			<Text style={[styles.stepHeading, { color: textColor }]}>
				Choisissez une catégorie
			</Text>
			<View
				style={[styles.searchBar2, { backgroundColor: cardBg, borderColor }]}
			>
				<Ionicons name="search" size={16} color={mutedColor} />
				<TextInput
					value={search}
					onChangeText={setSearch}
					placeholder="Rechercher une catégorie..."
					placeholderTextColor={mutedColor}
					style={[styles.searchInput2, { color: textColor }]}
				/>
			</View>
			<View style={styles.categoryGrid}>
				{categories.map((cat: any) => (
					<Pressable
						key={cat.id}
						onPress={() => {
							setForm((f: any) => ({ ...f, category: cat }));
							onNext();
						}}
						style={[
							styles.categoryCard,
							{
								backgroundColor:
									form.category?.id === cat.id
										? colors.isDark
											? "#1e3a5f"
											: "#dbeafe"
										: cardBg,
								borderColor:
									form.category?.id === cat.id ? primaryColor : borderColor,
							},
						]}
					>
						<Text style={styles.categoryEmoji}>{cat.emoji ?? "📦"}</Text>
						<Text
							style={[styles.categoryName, { color: textColor }]}
							numberOfLines={2}
						>
							{cat.name}
						</Text>
					</Pressable>
				))}
			</View>
		</ScrollView>
	);
}

function DetailsStep({ form, setForm, onNext, colors }: any) {
	const { bg, cardBg, textColor, mutedColor, primaryColor, borderColor } =
		colors;
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
		>
			<Text style={[styles.stepHeading, { color: textColor }]}>
				Détails de l'annonce
			</Text>

			<Text style={[styles.fieldLabel, { color: mutedColor }]}>Titre *</Text>
			<TextInput
				value={form.title}
				onChangeText={(v) => update("title", v)}
				placeholder="Ex: iPhone 13 Pro 256Go"
				placeholderTextColor={mutedColor}
				style={[
					styles.field,
					{ backgroundColor: cardBg, borderColor, color: textColor },
				]}
				maxLength={100}
			/>

			<Text style={[styles.fieldLabel, { color: mutedColor }]}>
				Description *
			</Text>
			<TextInput
				value={form.description}
				onChangeText={(v) => update("description", v)}
				placeholder="Décrivez votre article..."
				placeholderTextColor={mutedColor}
				style={[
					styles.field,
					styles.multiline,
					{ backgroundColor: cardBg, borderColor, color: textColor },
				]}
				multiline
				numberOfLines={4}
			/>

			<Text style={[styles.fieldLabel, { color: mutedColor }]}>
				Prix (XAF) *
			</Text>
			<TextInput
				value={form.price}
				onChangeText={(v) => update("price", v)}
				placeholder="Ex: 150000"
				placeholderTextColor={mutedColor}
				style={[
					styles.field,
					{ backgroundColor: cardBg, borderColor, color: textColor },
				]}
				keyboardType="numeric"
			/>

			<Text style={[styles.fieldLabel, { color: mutedColor }]}>État</Text>
			<View style={styles.conditionRow}>
				{CONDITIONS.map((c) => (
					<Pressable
						key={c}
						onPress={() => update("condition", c)}
						style={[
							styles.conditionPill,
							{
								backgroundColor: form.condition === c ? primaryColor : cardBg,
								borderColor: form.condition === c ? primaryColor : borderColor,
							},
						]}
					>
						<Text
							style={[
								styles.conditionText,
								{ color: form.condition === c ? "#fff" : mutedColor },
							]}
						>
							{CONDITION_LABELS[c]}
						</Text>
					</Pressable>
				))}
			</View>

			<Text style={[styles.fieldLabel, { color: mutedColor }]}>
				Localisation *
			</Text>
			<TextInput
				value={form.location}
				onChangeText={(v) => update("location", v)}
				placeholder="Ex: Douala, Akwa"
				placeholderTextColor={mutedColor}
				style={[
					styles.field,
					{ backgroundColor: cardBg, borderColor, color: textColor },
				]}
			/>

			<Text style={[styles.fieldLabel, { color: mutedColor }]}>Durée</Text>
			<View style={styles.durationRow}>
				{DURATIONS.map((d) => (
					<Pressable
						key={d}
						onPress={() => update("duration", d)}
						style={[
							styles.durationPill,
							{
								backgroundColor: form.duration === d ? primaryColor : cardBg,
								borderColor: form.duration === d ? primaryColor : borderColor,
							},
						]}
					>
						<Text
							style={[
								styles.conditionText,
								{ color: form.duration === d ? "#fff" : mutedColor },
							]}
						>
							{d} jours
						</Text>
					</Pressable>
				))}
			</View>

			<Pressable
				onPress={canProceed ? onNext : undefined}
				style={[
					styles.nextBtn,
					{
						backgroundColor: canProceed
							? primaryColor
							: colors.isDark
								? "#1e293b"
								: "#e2e8f0",
					},
				]}
			>
				<Text
					style={[
						styles.nextBtnText,
						{ color: canProceed ? "#fff" : mutedColor },
					]}
				>
					Continuer
				</Text>
				<Ionicons
					name="arrow-forward"
					size={18}
					color={canProceed ? "#fff" : mutedColor}
				/>
			</Pressable>
		</ScrollView>
	);
}

function AttributesStep({ form, onNext, setForm, colors }: any) {
	const attributes = form.category?.attributes ?? [];
	const { bg, textColor, mutedColor, primaryColor } = colors;

	// Skip this step automatically if no attributes
	if (attributes.length === 0) {
		onNext();
		return null;
	}

	return (
		<ScrollView
			style={{ flex: 1, backgroundColor: bg }}
			contentContainerStyle={{ padding: 16, paddingBottom: 40 }}
		>
			<Text style={[styles.stepHeading, { color: textColor }]}>
				Attributs de la catégorie
			</Text>
			<Text style={[styles.subtitle, { color: mutedColor }]}>
				Ces informations aideront les acheteurs à trouver votre annonce.
			</Text>
			<Pressable
				onPress={onNext}
				style={[
					styles.nextBtn,
					{ backgroundColor: primaryColor, marginTop: 24 },
				]}
			>
				<Text style={[styles.nextBtnText, { color: "#fff" }]}>Continuer</Text>
				<Ionicons name="arrow-forward" size={18} color="#fff" />
			</Pressable>
		</ScrollView>
	);
}

function PhotosStep({ form, setForm, onNext, colors }: any) {
	const { bg, cardBg, textColor, mutedColor, primaryColor, borderColor } =
		colors;

	return (
		<ScrollView
			style={{ flex: 1, backgroundColor: bg }}
			contentContainerStyle={{ padding: 16, paddingBottom: 40 }}
		>
			<Text style={[styles.stepHeading, { color: textColor }]}>
				Ajoutez des photos
			</Text>
			<Text style={[styles.subtitle, { color: mutedColor }]}>
				Au moins 1 photo requise. Jusqu'à 10 photos.
			</Text>

			<View style={styles.photosGrid}>
				{form.images.map((_img: string, i: number) => (
					<View
						key={i}
						style={[
							styles.photoThumb,
							{ backgroundColor: cardBg, borderColor },
						]}
					>
						<Text style={{ color: mutedColor }}>{i + 1}</Text>
					</View>
				))}
				<Pressable
					style={[styles.addPhotoBtn, { backgroundColor: cardBg, borderColor }]}
					onPress={() => {
						Alert.alert(
							"Photo",
							"Choisir depuis la galerie ou prendre une photo",
						);
					}}
				>
					<Ionicons name="add" size={32} color={mutedColor} />
					<Text style={[styles.addPhotoText, { color: mutedColor }]}>
						Ajouter
					</Text>
				</Pressable>
			</View>

			<Pressable
				onPress={onNext}
				style={[
					styles.nextBtn,
					{ backgroundColor: primaryColor, marginTop: 24 },
				]}
			>
				<Text style={[styles.nextBtnText, { color: "#fff" }]}>Continuer</Text>
				<Ionicons name="arrow-forward" size={18} color="#fff" />
			</Pressable>
		</ScrollView>
	);
}

function ReviewStep({ form, setStep, colors }: any) {
	const { user } = useAuth();
	const { bg, cardBg, textColor, mutedColor, primaryColor, borderColor } =
		colors;

	const { mutate: publish, isPending } = useMutation({
		mutationFn: async () => {
			return api.post<any>("/api/listings", {
				title: form.title,
				description: form.description,
				price: Number(form.price),
				condition: form.condition,
				location: form.location,
				category: form.category?.id,
				seller: user?.id,
			});
		},
		onSuccess: () => {
			Alert.alert(
				"🎉 Annonce publiée !",
				"Votre annonce est en attente de validation.",
				[{ text: "OK", onPress: () => router.push("/(tabs)/account") }],
			);
		},
		onError: (err: any) => {
			Alert.alert("Erreur", err.message ?? "Une erreur est survenue");
		},
	});

	return (
		<ScrollView
			style={{ flex: 1, backgroundColor: bg }}
			contentContainerStyle={{ padding: 16, paddingBottom: 40 }}
		>
			<Text style={[styles.stepHeading, { color: textColor }]}>
				Vérifier et publier
			</Text>

			<View
				style={[styles.reviewCard, { backgroundColor: cardBg, borderColor }]}
			>
				<ReviewRow
					label="Catégorie"
					value={form.category?.name ?? "—"}
					onEdit={() => setStep(0)}
					colors={colors}
				/>
				<ReviewRow
					label="Titre"
					value={form.title || "—"}
					onEdit={() => setStep(1)}
					colors={colors}
				/>
				<ReviewRow
					label="Prix"
					value={
						form.price
							? `${Number.parseInt(form.price, 10).toLocaleString()} XAF`
							: "—"
					}
					onEdit={() => setStep(1)}
					colors={colors}
				/>
				<ReviewRow
					label="État"
					value={CONDITION_LABELS[form.condition] ?? form.condition}
					onEdit={() => setStep(1)}
					colors={colors}
				/>
				<ReviewRow
					label="Localisation"
					value={form.location || "—"}
					onEdit={() => setStep(1)}
					colors={colors}
				/>
				<ReviewRow
					label="Photos"
					value={`${form.images.length} photo(s)`}
					onEdit={() => setStep(3)}
					colors={colors}
					isLast
				/>
			</View>

			<Pressable
				onPress={() => publish()}
				disabled={isPending}
				style={[styles.publishBtn, { backgroundColor: primaryColor }]}
			>
				{isPending ? (
					<ActivityIndicator color="#fff" />
				) : (
					<>
						<Ionicons name="checkmark-circle" size={20} color="#fff" />
						<Text style={styles.publishBtnText}>Publier l'annonce</Text>
					</>
				)}
			</Pressable>
		</ScrollView>
	);
}

function ReviewRow({ label, value, onEdit, colors, isLast }: any) {
	const { textColor, mutedColor, primaryColor, borderColor } = colors;
	return (
		<View
			style={[
				styles.reviewRow,
				{ borderBottomColor: isLast ? "transparent" : borderColor },
			]}
		>
			<Text style={[styles.reviewLabel, { color: mutedColor }]}>{label}</Text>
			<Text
				style={[styles.reviewValue, { color: textColor }]}
				numberOfLines={1}
			>
				{value}
			</Text>
			<Pressable onPress={onEdit}>
				<Text style={[styles.editLink, { color: primaryColor }]}>Modifier</Text>
			</Pressable>
		</View>
	);
}

const styles = StyleSheet.create({
	safe: { flex: 1 },
	center: {
		flex: 1,
		alignItems: "center",
		justifyContent: "center",
		padding: 32,
	},
	header: {
		flexDirection: "row",
		alignItems: "center",
		justifyContent: "space-between",
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
	headerTitle: { fontSize: 17, fontWeight: "700" },
	stepIndicator: {
		flexDirection: "row",
		alignItems: "center",
		paddingHorizontal: 16,
		paddingVertical: 16,
	},
	stepItem: { alignItems: "center" },
	stepCircle: {
		width: 28,
		height: 28,
		borderRadius: 14,
		alignItems: "center",
		justifyContent: "center",
		borderWidth: 2,
	},
	stepNum: { fontSize: 12, fontWeight: "700" },
	stepLabel: { fontSize: 10, fontWeight: "600", marginTop: 2 },
	stepLine: { flex: 1, height: 2, marginHorizontal: 4, marginBottom: 14 },
	stepHeading: { fontSize: 20, fontWeight: "700", marginBottom: 16 },
	subtitle: { fontSize: 14, marginBottom: 8 },
	searchBar2: {
		flexDirection: "row",
		alignItems: "center",
		gap: 8,
		borderRadius: 10,
		borderWidth: 1,
		paddingHorizontal: 12,
		paddingVertical: 10,
		marginBottom: 16,
	},
	searchInput2: { flex: 1, fontSize: 14 },
	categoryGrid: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
	categoryCard: {
		width: "30%",
		aspectRatio: 1,
		borderRadius: 12,
		borderWidth: 1.5,
		alignItems: "center",
		justifyContent: "center",
		padding: 8,
	},
	categoryEmoji: { fontSize: 28, marginBottom: 4 },
	categoryName: { fontSize: 11, textAlign: "center", fontWeight: "500" },
	fieldLabel: {
		fontSize: 13,
		fontWeight: "600",
		marginBottom: 6,
		marginTop: 12,
	},
	field: {
		borderWidth: 1,
		borderRadius: 10,
		paddingHorizontal: 12,
		paddingVertical: 12,
		fontSize: 15,
	},
	multiline: { height: 100, textAlignVertical: "top" },
	conditionRow: {
		flexDirection: "row",
		flexWrap: "wrap",
		gap: 8,
		marginBottom: 4,
	},
	conditionPill: {
		borderRadius: 20,
		borderWidth: 1,
		paddingHorizontal: 12,
		paddingVertical: 6,
	},
	conditionText: { fontSize: 13, fontWeight: "600" },
	durationRow: { flexDirection: "row", gap: 8 },
	durationPill: {
		borderRadius: 20,
		borderWidth: 1,
		paddingHorizontal: 12,
		paddingVertical: 6,
	},
	nextBtn: {
		flexDirection: "row",
		alignItems: "center",
		justifyContent: "center",
		gap: 8,
		borderRadius: 14,
		paddingVertical: 14,
		marginTop: 24,
	},
	nextBtnText: { fontSize: 16, fontWeight: "700" },
	photosGrid: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
	photoThumb: {
		width: 100,
		height: 100,
		borderRadius: 10,
		borderWidth: 1,
		alignItems: "center",
		justifyContent: "center",
	},
	addPhotoBtn: {
		width: 100,
		height: 100,
		borderRadius: 10,
		borderWidth: 1.5,
		borderStyle: "dashed",
		alignItems: "center",
		justifyContent: "center",
	},
	addPhotoText: { fontSize: 11, marginTop: 4 },
	reviewCard: {
		borderRadius: 12,
		borderWidth: 1,
		overflow: "hidden",
		marginBottom: 16,
	},
	reviewRow: {
		flexDirection: "row",
		alignItems: "center",
		padding: 12,
		borderBottomWidth: 1,
	},
	reviewLabel: { width: 90, fontSize: 13, fontWeight: "600" },
	reviewValue: { flex: 1, fontSize: 14 },
	editLink: { fontSize: 13, fontWeight: "600" },
	publishBtn: {
		flexDirection: "row",
		alignItems: "center",
		justifyContent: "center",
		gap: 8,
		borderRadius: 14,
		paddingVertical: 16,
	},
	publishBtnText: { color: "#fff", fontSize: 17, fontWeight: "800" },
	title: {
		fontSize: 22,
		fontWeight: "700",
		marginBottom: 8,
		textAlign: "center",
	},
	primaryBtn: {
		borderRadius: 12,
		paddingHorizontal: 24,
		paddingVertical: 12,
		marginTop: 16,
	},
	primaryBtnText: { color: "#fff", fontWeight: "700", fontSize: 16 },
});
