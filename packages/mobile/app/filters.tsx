import { Ionicons } from "@expo/vector-icons";
import { useQuery } from "@tanstack/react-query";
import { router, useLocalSearchParams } from "expo-router";
import { useState } from "react";
import {
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

const CONDITIONS = [
	{ key: "new", label: "Neuf" },
	{ key: "like_new", label: "Très bon état" },
	{ key: "good", label: "Bon état" },
	{ key: "fair", label: "État correct" },
	{ key: "poor", label: "À rénover" },
];

const RADIUS_OPTIONS = [5, 10, 25, 50, 100];

export default function FiltersModal() {
	const isDark = useColorScheme() === "dark";
	const params = useLocalSearchParams<{
		category?: string;
		minPrice?: string;
		maxPrice?: string;
	}>();

	const [selectedCategory, setSelectedCategory] = useState(
		params.category ?? "",
	);
	const [minPrice, setMinPrice] = useState(params.minPrice ?? "");
	const [maxPrice, setMaxPrice] = useState(params.maxPrice ?? "");
	const [selectedConditions, setSelectedConditions] = useState<string[]>([]);
	const [location, setLocation] = useState("");
	const [radius, setRadius] = useState(10);

	const bg = isDark ? "#0b1120" : "#f8fafc";
	const cardBg = isDark ? "#1e293b" : "#ffffff";
	const textColor = isDark ? "#e2e8f0" : "#0f172a";
	const mutedColor = isDark ? "#94a3b8" : "#64748b";
	const primaryColor = isDark ? "#3b82f6" : "#1e40af";
	const borderColor = isDark ? "#1e3a5f" : "#e2e8f0";

	const { data: catsData } = useQuery({
		queryKey: ["categories"],
		queryFn: () => api.get<{ categories: any[] }>("/api/public/categories"),
		staleTime: 3600000,
	});
	const categories = catsData?.categories ?? [];

	const toggleCondition = (key: string) =>
		setSelectedConditions((prev) =>
			prev.includes(key) ? prev.filter((c) => c !== key) : [...prev, key],
		);

	const handleApply = () => {
		router.dismiss();
	};

	const handleReset = () => {
		setSelectedCategory("");
		setMinPrice("");
		setMaxPrice("");
		setSelectedConditions([]);
		setLocation("");
		setRadius(10);
	};

	const activeCount = [
		selectedCategory,
		minPrice,
		maxPrice,
		selectedConditions.length > 0,
		location,
	].filter(Boolean).length;

	return (
		<SafeAreaView
			edges={["top"]}
			style={[styles.safe, { backgroundColor: bg }]}
		>
			<View style={[styles.header, { borderBottomColor: borderColor }]}>
				<Pressable onPress={() => router.dismiss()}>
					<Ionicons name="close" size={24} color={textColor} />
				</Pressable>
				<Text style={[styles.title, { color: textColor }]}>
					Filtres{activeCount > 0 ? ` (${activeCount})` : ""}
				</Text>
				<Pressable onPress={handleReset}>
					<Text style={[styles.resetText, { color: primaryColor }]}>
						Réinitialiser
					</Text>
				</Pressable>
			</View>

			<ScrollView contentContainerStyle={styles.scroll}>
				{/* Category */}
				<Text style={[styles.sectionTitle, { color: textColor }]}>
					Catégorie
				</Text>
				<ScrollView
					horizontal
					showsHorizontalScrollIndicator={false}
					contentContainerStyle={styles.categoryRow}
				>
					{categories.map((cat: any) => (
						<Pressable
							key={cat.id}
							onPress={() =>
								setSelectedCategory(selectedCategory === cat.id ? "" : cat.id)
							}
							style={[
								styles.categoryPill,
								{
									backgroundColor:
										selectedCategory === cat.id ? primaryColor : cardBg,
									borderColor:
										selectedCategory === cat.id ? primaryColor : borderColor,
								},
							]}
						>
							<Ionicons
								name="cube-outline"
								size={16}
								color={selectedCategory === cat.id ? "#fff" : "#64748b"}
							/>
							<Text
								style={[
									styles.categoryPillText,
									{ color: selectedCategory === cat.id ? "#fff" : textColor },
								]}
							>
								{cat.name}
							</Text>
						</Pressable>
					))}
				</ScrollView>

				{/* Price Range */}
				<Text style={[styles.sectionTitle, { color: textColor }]}>
					Fourchette de prix (XAF)
				</Text>
				<View style={styles.priceRow}>
					<TextInput
						value={minPrice}
						onChangeText={setMinPrice}
						placeholder="Min"
						placeholderTextColor={mutedColor}
						style={[
							styles.priceInput,
							{ backgroundColor: cardBg, borderColor, color: textColor },
						]}
						keyboardType="numeric"
					/>
					<Text style={[styles.priceSep, { color: mutedColor }]}>—</Text>
					<TextInput
						value={maxPrice}
						onChangeText={setMaxPrice}
						placeholder="Max"
						placeholderTextColor={mutedColor}
						style={[
							styles.priceInput,
							{ backgroundColor: cardBg, borderColor, color: textColor },
						]}
						keyboardType="numeric"
					/>
				</View>

				{/* Condition */}
				<Text style={[styles.sectionTitle, { color: textColor }]}>État</Text>
				<View style={styles.conditionGrid}>
					{CONDITIONS.map((c) => (
						<Pressable
							key={c.key}
							onPress={() => toggleCondition(c.key)}
							style={[
								styles.conditionPill,
								{
									backgroundColor: selectedConditions.includes(c.key)
										? primaryColor
										: cardBg,
									borderColor: selectedConditions.includes(c.key)
										? primaryColor
										: borderColor,
								},
							]}
						>
							<Text
								style={[
									styles.conditionText,
									{
										color: selectedConditions.includes(c.key)
											? "#fff"
											: textColor,
									},
								]}
							>
								{c.label}
							</Text>
							{selectedConditions.includes(c.key) && (
								<Ionicons name="checkmark" size={14} color="#fff" />
							)}
						</Pressable>
					))}
				</View>

				{/* Location */}
				<Text style={[styles.sectionTitle, { color: textColor }]}>
					Localisation
				</Text>
				<TextInput
					value={location}
					onChangeText={setLocation}
					placeholder="Ex: Douala"
					placeholderTextColor={mutedColor}
					style={[
						styles.locationInput,
						{ backgroundColor: cardBg, borderColor, color: textColor },
					]}
				/>

				{/* Radius */}
				{location.length > 0 && (
					<>
						<Text style={[styles.sectionTitle, { color: textColor }]}>
							Rayon
						</Text>
						<View style={styles.radiusRow}>
							{RADIUS_OPTIONS.map((r) => (
								<Pressable
									key={r}
									onPress={() => setRadius(r)}
									style={[
										styles.radiusPill,
										{
											backgroundColor: radius === r ? primaryColor : cardBg,
											borderColor: radius === r ? primaryColor : borderColor,
										},
									]}
								>
									<Text
										style={[
											styles.radiusText,
											{ color: radius === r ? "#fff" : mutedColor },
										]}
									>
										{r} km
									</Text>
								</Pressable>
							))}
						</View>
					</>
				)}
			</ScrollView>

			<View
				style={[
					styles.footer,
					{ borderTopColor: borderColor, backgroundColor: cardBg },
				]}
			>
				<Pressable
					onPress={handleApply}
					style={[styles.applyBtn, { backgroundColor: primaryColor }]}
				>
					<Text style={styles.applyText}>Appliquer les filtres</Text>
				</Pressable>
			</View>
		</SafeAreaView>
	);
}

const styles = StyleSheet.create({
	safe: { flex: 1 },
	header: {
		flexDirection: "row",
		alignItems: "center",
		justifyContent: "space-between",
		paddingHorizontal: 16,
		paddingVertical: 14,
		borderBottomWidth: 1,
	},
	title: { fontSize: 17, fontWeight: "700" },
	resetText: { fontSize: 14, fontWeight: "600" },
	scroll: { padding: 20, paddingBottom: 80, gap: 16 },
	sectionTitle: { fontSize: 15, fontWeight: "700" },
	categoryRow: { gap: 8, paddingBottom: 4 },
	categoryPill: {
		flexDirection: "row",
		alignItems: "center",
		gap: 6,
		borderRadius: 22,
		borderWidth: 1,
		paddingHorizontal: 12,
		paddingVertical: 8,
	},
	categoryPillText: { fontSize: 13, fontWeight: "500" },
	priceRow: { flexDirection: "row", alignItems: "center", gap: 10 },
	priceInput: {
		flex: 1,
		borderRadius: 10,
		borderWidth: 1.5,
		paddingHorizontal: 12,
		paddingVertical: 11,
		fontSize: 15,
	},
	priceSep: { fontSize: 18 },
	conditionGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
	conditionPill: {
		flexDirection: "row",
		alignItems: "center",
		gap: 4,
		borderRadius: 20,
		borderWidth: 1,
		paddingHorizontal: 14,
		paddingVertical: 8,
	},
	conditionText: { fontSize: 13, fontWeight: "500" },
	locationInput: {
		borderRadius: 10,
		borderWidth: 1.5,
		paddingHorizontal: 12,
		paddingVertical: 11,
		fontSize: 15,
	},
	radiusRow: { flexDirection: "row", gap: 8 },
	radiusPill: {
		borderRadius: 20,
		borderWidth: 1,
		paddingHorizontal: 14,
		paddingVertical: 8,
	},
	radiusText: { fontSize: 13, fontWeight: "600" },
	footer: { padding: 16, borderTopWidth: 1 },
	applyBtn: { borderRadius: 14, paddingVertical: 15, alignItems: "center" },
	applyText: { color: "#fff", fontSize: 16, fontWeight: "700" },
});
