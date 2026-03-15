import { Ionicons } from "@expo/vector-icons";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { router, useLocalSearchParams } from "expo-router";
import { useState } from "react";
import {
	ActivityIndicator,
	Pressable,
	ScrollView,
	StyleSheet,
	Text,
	TextInput,
	View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useColorScheme } from "@/hooks/use-color-scheme";
import { useAlert } from "@/src/contexts/AlertContext";
import { api } from "@/src/lib/api";
import { useAuth } from "@/src/lib/auth";

const CONDITIONS = [
	{ key: "new", label: "Neuf" },
	{ key: "like_new", label: "Très bon état" },
	{ key: "good", label: "Bon état" },
	{ key: "fair", label: "État correct" },
	{ key: "poor", label: "À rénover" },
];

export default function EditListingScreen() {
	const { id } = useLocalSearchParams<{ id: string }>();
	const isDark = useColorScheme() === "dark";
	const { user } = useAuth();
	const queryClient = useQueryClient();
	const { showSuccess, showError } = useAlert();

	const bg = isDark ? "#0b1120" : "#f8fafc";
	const cardBg = isDark ? "#1e293b" : "#ffffff";
	const textColor = isDark ? "#e2e8f0" : "#0f172a";
	const mutedColor = isDark ? "#94a3b8" : "#64748b";
	const primaryColor = isDark ? "#3b82f6" : "#1e40af";
	const borderColor = isDark ? "#1e3a5f" : "#e2e8f0";

	const { data, isLoading } = useQuery({
		queryKey: ["listing", id],
		queryFn: () => api.get<any>(`/api/listings/${id}?depth=1`),
		enabled: !!id,
	});

	const listing = data?.doc ?? data;

	const [title, setTitle] = useState("");
	const [description, setDescription] = useState("");
	const [price, setPrice] = useState("");
	const [condition, setCondition] = useState("new");
	const [location, setLocation] = useState("");
	const [initialized, setInitialized] = useState(false);

	// Initialize form from listing data once loaded
	if (listing && !initialized) {
		setTitle(listing.title ?? "");
		setDescription(listing.description ?? "");
		setPrice(String(listing.price ?? ""));
		setCondition(listing.condition ?? "new");
		setLocation(listing.location ?? "");
		setInitialized(true);
	}

	const { mutate: save, isPending } = useMutation({
		mutationFn: () =>
			api.patch(`/api/listings/${id}`, {
				title,
				description,
				price: Number(price),
				condition,
				location,
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

	if (isLoading) {
		return (
			<View style={[styles.loader, { backgroundColor: bg }]}>
				<ActivityIndicator color={primaryColor} />
			</View>
		);
	}

	return (
		<SafeAreaView style={[styles.safe, { backgroundColor: bg }]}>
			<View style={[styles.header, { borderBottomColor: borderColor }]}>
				<Pressable onPress={() => router.back()}>
					<Ionicons name="arrow-back" size={22} color={textColor} />
				</Pressable>
				<Text style={[styles.headerTitle, { color: textColor }]}>
					Modifier l'annonce
				</Text>
				<Pressable onPress={() => save()} disabled={isPending}>
					{isPending ? (
						<ActivityIndicator color={primaryColor} />
					) : (
						<Text style={[styles.saveBtn, { color: primaryColor }]}>
							Sauvegarder
						</Text>
					)}
				</Pressable>
			</View>

			<ScrollView contentContainerStyle={styles.scroll}>
				{/* Title */}
				<View style={styles.fieldGroup}>
					<Text style={[styles.label, { color: mutedColor }]}>Titre *</Text>
					<TextInput
						value={title}
						onChangeText={setTitle}
						placeholder="Titre de l'annonce"
						placeholderTextColor={mutedColor}
						style={[
							styles.field,
							{ backgroundColor: cardBg, borderColor, color: textColor },
						]}
						maxLength={100}
					/>
				</View>

				{/* Description */}
				<View style={styles.fieldGroup}>
					<Text style={[styles.label, { color: mutedColor }]}>
						Description *
					</Text>
					<TextInput
						value={description}
						onChangeText={setDescription}
						placeholder="Décrivez votre article..."
						placeholderTextColor={mutedColor}
						style={[
							styles.field,
							styles.multiline,
							{ backgroundColor: cardBg, borderColor, color: textColor },
						]}
						multiline
						numberOfLines={5}
					/>
				</View>

				{/* Price */}
				<View style={styles.fieldGroup}>
					<Text style={[styles.label, { color: mutedColor }]}>
						Prix (XAF) *
					</Text>
					<TextInput
						value={price}
						onChangeText={setPrice}
						placeholder="Ex: 150000"
						placeholderTextColor={mutedColor}
						style={[
							styles.field,
							{ backgroundColor: cardBg, borderColor, color: textColor },
						]}
						keyboardType="numeric"
					/>
				</View>

				{/* Condition */}
				<View style={styles.fieldGroup}>
					<Text style={[styles.label, { color: mutedColor }]}>État</Text>
					<View style={styles.conditionRow}>
						{CONDITIONS.map((c) => (
							<Pressable
								key={c.key}
								onPress={() => setCondition(c.key)}
								style={[
									styles.conditionPill,
									{
										backgroundColor:
											condition === c.key ? primaryColor : cardBg,
										borderColor:
											condition === c.key ? primaryColor : borderColor,
									},
								]}
							>
								<Text
									style={[
										styles.conditionText,
										{ color: condition === c.key ? "#fff" : mutedColor },
									]}
								>
									{c.label}
								</Text>
							</Pressable>
						))}
					</View>
				</View>

				{/* Location */}
				<View style={styles.fieldGroup}>
					<Text style={[styles.label, { color: mutedColor }]}>
						Localisation *
					</Text>
					<TextInput
						value={location}
						onChangeText={setLocation}
						placeholder="Ex: Douala, Akwa"
						placeholderTextColor={mutedColor}
						style={[
							styles.field,
							{ backgroundColor: cardBg, borderColor, color: textColor },
						]}
					/>
				</View>

				<Pressable
					onPress={() => save()}
					disabled={isPending}
					style={[styles.submitBtn, { backgroundColor: primaryColor }]}
				>
					{isPending ? (
						<ActivityIndicator color="#fff" />
					) : (
						<>
							<Ionicons name="checkmark-circle" size={20} color="#fff" />
							<Text style={styles.submitText}>
								Sauvegarder les modifications
							</Text>
						</>
					)}
				</Pressable>
			</ScrollView>
		</SafeAreaView>
	);
}

const styles = StyleSheet.create({
	safe: { flex: 1 },
	loader: { flex: 1, alignItems: "center", justifyContent: "center" },
	header: {
		flexDirection: "row",
		alignItems: "center",
		justifyContent: "space-between",
		paddingHorizontal: 16,
		paddingVertical: 14,
		borderBottomWidth: 1,
	},
	headerTitle: { fontSize: 17, fontWeight: "700" },
	saveBtn: { fontSize: 15, fontWeight: "700" },
	scroll: { padding: 20, gap: 16, paddingBottom: 40 },
	fieldGroup: { gap: 6 },
	label: { fontSize: 13, fontWeight: "600" },
	field: {
		borderRadius: 10,
		borderWidth: 1.5,
		paddingHorizontal: 12,
		paddingVertical: 11,
		fontSize: 15,
	},
	multiline: { minHeight: 120, textAlignVertical: "top" },
	conditionRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
	conditionPill: {
		borderRadius: 20,
		borderWidth: 1,
		paddingHorizontal: 12,
		paddingVertical: 7,
	},
	conditionText: { fontSize: 13, fontWeight: "600" },
	submitBtn: {
		flexDirection: "row",
		alignItems: "center",
		justifyContent: "center",
		gap: 8,
		borderRadius: 14,
		paddingVertical: 15,
		marginTop: 8,
	},
	submitText: { color: "#fff", fontSize: 16, fontWeight: "700" },
});
