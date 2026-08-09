import { Ionicons } from "@expo/vector-icons";
import { useQuery } from "@tanstack/react-query";
import { router, useLocalSearchParams } from "expo-router";
import { useMemo, useState } from "react";
import {
	Pressable,
	ScrollView,
	StyleSheet,
	Text,
	TextInput,
	View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Fonts } from "@/constants/theme";
import { useColorScheme } from "@/hooks/use-color-scheme";
import { CityPicker } from "@/src/components/CityPicker";
import { TagPicker } from "@/src/components/TagPicker";
import {
	CATEGORIES_QUERY_KEY,
	CATEGORIES_STALE_TIME_MS,
} from "@/src/hooks/useListings";
import { useResponsive } from "@/src/hooks/useResponsive";
import { api } from "@/src/lib/api";
import type { CameroonCity } from "@/src/lib/cameroon-cities";
import { useTranslation } from "@/src/lib/i18n";

const RADIUS_OPTIONS = [5, 10, 25, 50, 100];

export default function FiltersModal() {
	const isDark = useColorScheme() === "dark";
	const { centeredContent } = useResponsive();
	const { t } = useTranslation();

	const CONDITIONS = [
		{ key: "new", label: t("filters.conditionNew") },
		{ key: "like_new", label: t("filters.conditionLikeNew") },
		{ key: "good", label: t("filters.conditionGood") },
		{ key: "fair", label: t("filters.conditionFair") },
		{ key: "poor", label: t("filters.conditionPoor") },
	];

	// On récupère tous les params sans typage pour accéder aux attr_*
	const rawParams = useLocalSearchParams();
	const returnTo = rawParams.returnTo as string | undefined;

	// Params de base
	const [selectedCategory, setSelectedCategory] = useState(
		(rawParams.category as string) ?? "",
	);
	const [minPrice, setMinPrice] = useState(
		(rawParams.minPrice as string) ?? "",
	);
	const [maxPrice, setMaxPrice] = useState(
		(rawParams.maxPrice as string) ?? "",
	);
	const [selectedConditions, setSelectedConditions] = useState<string[]>(
		rawParams.conditions ? (rawParams.conditions as string).split(",") : [],
	);
	const [location, setLocation] = useState(
		(rawParams.location as string) ?? "",
	);
	const [locationLat, setLocationLat] = useState(
		rawParams.lat ? Number(rawParams.lat) : (null as number | null),
	);
	const [locationLng, setLocationLng] = useState(
		rawParams.lng ? Number(rawParams.lng) : (null as number | null),
	);
	const [radius, setRadius] = useState(
		rawParams.radius ? Number(rawParams.radius) : 10,
	);

	const [selectedTags, setSelectedTags] = useState<string[]>(
		rawParams.tags ? (rawParams.tags as string).split(",").filter(Boolean) : [],
	);

	const { data: tagsData } = useQuery({
		queryKey: ["tags"],
		queryFn: () => api.get<any[]>("/api/public/tags"),
		staleTime: 3600000,
	});
	const availableTags: any[] = Array.isArray(tagsData) ? tagsData : [];

	const _toggleTag = (slug: string) =>
		setSelectedTags((prev) =>
			prev.includes(slug) ? prev.filter((s) => s !== slug) : [...prev, slug],
		);

	// Attributs dynamiques — initialisés depuis les params attr_*
	const [attributeFilters, setAttributeFilters] = useState<
		Record<string, string>
	>(() => {
		const initial: Record<string, string> = {};
		for (const [key, value] of Object.entries(rawParams)) {
			if (key.startsWith("attr_") && typeof value === "string" && value) {
				initial[key.replace("attr_", "")] = value;
			}
		}
		return initial;
	});

	// ── Couleurs ────────────────────────────────────────────────
	const bg = isDark ? "#0b1120" : "#f8fafc";
	const cardBg = isDark ? "#1e293b" : "#ffffff";
	const textColor = isDark ? "#e2e8f0" : "#0f172a";
	const mutedColor = isDark ? "#94a3b8" : "#64748b";
	const primaryColor = isDark ? "#3b82f6" : "#1e40af";
	const borderColor = isDark ? "#1e3a5f" : "#e2e8f0";

	// ── Catégories + attributs ──────────────────────────────────
	const { data: catsData } = useQuery({
		queryKey: CATEGORIES_QUERY_KEY,
		queryFn: () => api.get<{ categories: any[] }>("/api/public/categories"),
		staleTime: CATEGORIES_STALE_TIME_MS,
	});
	const categories = catsData?.categories ?? [];

	const categoryAttributes = useMemo(() => {
		if (!selectedCategory) return [];
		const cat = categories.find((c: any) => String(c.id) === selectedCategory);
		return ((cat?.attributes ?? []) as any[]).filter(
			(a: any) => a.filterable !== false,
		);
	}, [selectedCategory, categories]);

	const selectedCategoryName = useMemo(() => {
		const cat = categories.find((c: any) => String(c.id) === selectedCategory);
		return cat?.name ?? "";
	}, [selectedCategory, categories]);

	// ── Handlers ────────────────────────────────────────────────
	const toggleCondition = (key: string) =>
		setSelectedConditions((prev) =>
			prev.includes(key) ? prev.filter((c) => c !== key) : [...prev, key],
		);

	const handleApply = () => {
		const filterParams: Record<string, string> = {};
		if (selectedCategory) filterParams.category = selectedCategory;
		if (minPrice) filterParams.minPrice = minPrice;
		if (maxPrice) filterParams.maxPrice = maxPrice;
		if (selectedConditions.length)
			filterParams.conditions = selectedConditions.join(",");
		if (selectedTags.length) filterParams.tags = selectedTags.join(",");
		if (location) filterParams.location = location;
		if (location) filterParams.radius = String(radius);
		if (location && locationLat != null) filterParams.lat = String(locationLat);
		if (location && locationLng != null) filterParams.lng = String(locationLng);
		for (const [slug, value] of Object.entries(attributeFilters)) {
			if (value) filterParams[`attr_${slug}`] = value;
		}

		if (returnTo) {
			router.navigate({ pathname: returnTo as any, params: filterParams });
		} else {
			router.dismiss();
		}
	};

	const handleReset = () => {
		setSelectedCategory("");
		setMinPrice("");
		setMaxPrice("");
		setSelectedConditions([]);
		setSelectedTags([]);
		setLocation("");
		setRadius(10);
		setAttributeFilters({});
	};

	const activeCount = [
		selectedCategory,
		minPrice,
		maxPrice,
		selectedConditions.length > 0,
		selectedTags.length > 0,
		location,
		...Object.values(attributeFilters).filter(Boolean),
	].filter(Boolean).length;

	// ── Render ──────────────────────────────────────────────────
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
					{t("filters.title")}
					{activeCount > 0 ? ` (${activeCount})` : ""}
				</Text>
				<Pressable onPress={handleReset}>
					<Text style={[styles.resetText, { color: primaryColor }]}>
						{t("filters.reset")}
					</Text>
				</Pressable>
			</View>

			<ScrollView contentContainerStyle={[styles.scroll, centeredContent]}>
				{/* ── Catégorie ── */}
				<Text style={[styles.sectionTitle, { color: mutedColor }]}>
					{t("filters.category")}
				</Text>
				<ScrollView
					horizontal
					showsHorizontalScrollIndicator={false}
					contentContainerStyle={styles.pillRow}
				>
					{categories.map((cat: any) => {
						const active = selectedCategory === String(cat.id);
						return (
							<Pressable
								key={cat.id}
								onPress={() => {
									setSelectedCategory(active ? "" : String(cat.id));
									setAttributeFilters({});
								}}
								style={[
									styles.pill,
									{
										backgroundColor: active ? primaryColor : cardBg,
										borderColor: active ? primaryColor : borderColor,
									},
								]}
							>
								<Ionicons
									name="cube-outline"
									size={14}
									color={active ? "#fff" : mutedColor}
								/>
								<Text
									style={[
										styles.pillText,
										{ color: active ? "#fff" : textColor },
									]}
								>
									{cat.name}
								</Text>
							</Pressable>
						);
					})}
				</ScrollView>

				{/* ── Prix ── */}
				<Text style={[styles.sectionTitle, { color: mutedColor }]}>
					{t("filters.price")}
				</Text>
				<View style={styles.priceRow}>
					<TextInput
						value={minPrice}
						onChangeText={setMinPrice}
						placeholder={t("filters.minPrice")}
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
						placeholder={t("filters.maxPrice")}
						placeholderTextColor={mutedColor}
						style={[
							styles.priceInput,
							{ backgroundColor: cardBg, borderColor, color: textColor },
						]}
						keyboardType="numeric"
					/>
				</View>

				{/* ── État ── */}
				<Text style={[styles.sectionTitle, { color: mutedColor }]}>
					{t("filters.condition")}
				</Text>
				<View style={styles.conditionGrid}>
					{CONDITIONS.map((c) => {
						const active = selectedConditions.includes(c.key);
						return (
							<Pressable
								key={c.key}
								onPress={() => toggleCondition(c.key)}
								style={[
									styles.pill,
									{
										backgroundColor: active ? primaryColor : cardBg,
										borderColor: active ? primaryColor : borderColor,
									},
								]}
							>
								{active && <Ionicons name="checkmark" size={13} color="#fff" />}
								<Text
									style={[
										styles.pillText,
										{ color: active ? "#fff" : textColor },
									]}
								>
									{c.label}
								</Text>
							</Pressable>
						);
					})}
				</View>

				{/* ── Tags ── */}
				{availableTags.length > 0 && (
					<>
						<Text style={[styles.sectionTitle, { color: mutedColor }]}>
							Tags
						</Text>
						<TagPicker
							selectedSlugs={selectedTags}
							onChangeSlugs={setSelectedTags}
							availableTags={availableTags}
							inputBg={cardBg}
							borderColor={borderColor}
							textColor={textColor}
							mutedColor={mutedColor}
							primaryColor={primaryColor}
						/>
					</>
				)}

				{/* ── Localisation ── */}
				<Text style={[styles.sectionTitle, { color: mutedColor }]}>
					{t("filters.location")}
				</Text>
				<CityPicker
					value={location}
					onSelect={(city: CameroonCity) => {
						setLocation(city.name);
						setLocationLat(city.lat);
						setLocationLng(city.lng);
					}}
					onClear={() => {
						setLocation("");
						setLocationLat(null);
						setLocationLng(null);
					}}
					inputBg={cardBg}
					borderColor={borderColor}
					textColor={textColor}
					mutedColor={mutedColor}
					primaryColor={primaryColor}
				/>

				{/* ── Rayon ── */}
				{location.length > 0 && (
					<>
						<Text style={[styles.sectionTitle, { color: mutedColor }]}>
							{t("filters.radius")}
						</Text>
						<View style={styles.pillRow}>
							{RADIUS_OPTIONS.map((r) => {
								const active = radius === r;
								return (
									<Pressable
										key={r}
										onPress={() => setRadius(r)}
										style={[
											styles.pill,
											{
												backgroundColor: active ? primaryColor : cardBg,
												borderColor: active ? primaryColor : borderColor,
											},
										]}
									>
										<Text
											style={[
												styles.pillText,
												{ color: active ? "#fff" : mutedColor },
											]}
										>
											{r} km
										</Text>
									</Pressable>
								);
							})}
						</View>
					</>
				)}

				{/* ── Attributs dynamiques de la catégorie ── */}
				{categoryAttributes.length > 0 && (
					<>
						<View
							style={[styles.attrDivider, { borderTopColor: borderColor }]}
						/>
						<Text style={[styles.attrSectionHeader, { color: textColor }]}>
							{selectedCategoryName}
						</Text>

						{categoryAttributes.map((attr: any) => (
							<View key={attr.slug} style={styles.attrBlock}>
								<Text style={[styles.attrLabel, { color: mutedColor }]}>
									{attr.name}
								</Text>

								{attr.type === "select" && attr.options ? (
									<ScrollView
										horizontal
										showsHorizontalScrollIndicator={false}
										contentContainerStyle={styles.pillRow}
									>
										{attr.options.map((opt: any) => {
											const active = attributeFilters[attr.slug] === opt.value;
											return (
												<Pressable
													key={opt.value}
													onPress={() =>
														setAttributeFilters((prev) => ({
															...prev,
															[attr.slug]: active ? "" : opt.value,
														}))
													}
													style={[
														styles.pill,
														{
															backgroundColor: active ? primaryColor : cardBg,
															borderColor: active ? primaryColor : borderColor,
														},
													]}
												>
													<Text
														style={[
															styles.pillText,
															{ color: active ? "#fff" : textColor },
														]}
													>
														{opt.value}
													</Text>
												</Pressable>
											);
										})}
									</ScrollView>
								) : attr.type === "boolean" ? (
									<View style={styles.boolRow}>
										{[
											{ label: t("common.yes"), value: "true" },
											{ label: t("common.no"), value: "false" },
										].map((opt) => {
											const active = attributeFilters[attr.slug] === opt.value;
											return (
												<Pressable
													key={opt.value}
													onPress={() =>
														setAttributeFilters((prev) => ({
															...prev,
															[attr.slug]: active ? "" : opt.value,
														}))
													}
													style={[
														styles.pill,
														{
															backgroundColor: active ? primaryColor : cardBg,
															borderColor: active ? primaryColor : borderColor,
														},
													]}
												>
													<Text
														style={[
															styles.pillText,
															{ color: active ? "#fff" : textColor },
														]}
													>
														{opt.label}
													</Text>
												</Pressable>
											);
										})}
									</View>
								) : (
									<TextInput
										value={attributeFilters[attr.slug] ?? ""}
										onChangeText={(v) =>
											setAttributeFilters((prev) => ({
												...prev,
												[attr.slug]: v,
											}))
										}
										placeholder={attr.name}
										placeholderTextColor={mutedColor}
										keyboardType={
											attr.type === "number" ? "numeric" : "default"
										}
										style={[
											styles.textInput,
											{
												backgroundColor: cardBg,
												borderColor,
												color: textColor,
											},
										]}
									/>
								)}
							</View>
						))}
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
					<Text style={styles.applyText}>{t("filters.apply")}</Text>
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
	title: { fontSize: 17, fontFamily: Fonts.displayBold },
	resetText: { fontSize: 14, fontFamily: Fonts.bodySemibold },
	scroll: { padding: 20, paddingBottom: 80, gap: 14 },

	sectionTitle: {
		fontSize: 11,
		fontFamily: Fonts.bodySemibold,
		letterSpacing: 0.8,
		textTransform: "uppercase",
	},

	// Pills
	pillRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
	pill: {
		flexDirection: "row",
		alignItems: "center",
		gap: 5,
		borderRadius: 20,
		borderWidth: 1,
		paddingHorizontal: 12,
		paddingVertical: 7,
	},
	pillText: { fontSize: 13, fontFamily: Fonts.bodyMedium },

	// Prix
	priceRow: { flexDirection: "row", alignItems: "center", gap: 10 },
	priceInput: {
		flex: 1,
		borderRadius: 10,
		borderWidth: 1.5,
		paddingHorizontal: 12,
		paddingVertical: 11,
		fontSize: 15,
		fontFamily: Fonts.body,
	},
	priceSep: { fontSize: 18, fontFamily: Fonts.body },

	// Condition grid
	conditionGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8 },

	// Inputs texte
	textInput: {
		borderRadius: 10,
		borderWidth: 1.5,
		paddingHorizontal: 12,
		paddingVertical: 11,
		fontSize: 15,
		fontFamily: Fonts.body,
	},

	// Section attributs dynamiques
	attrDivider: {
		borderTopWidth: 1,
		marginTop: 4,
		marginBottom: 4,
	},
	attrSectionHeader: {
		fontSize: 16,
		fontFamily: Fonts.displayBold,
		marginBottom: 2,
	},
	attrBlock: { gap: 8 },
	attrLabel: {
		fontSize: 11,
		fontFamily: Fonts.bodySemibold,
		letterSpacing: 0.8,
		textTransform: "uppercase",
	},
	boolRow: { flexDirection: "row", gap: 8 },

	// Footer
	footer: { padding: 16, borderTopWidth: 1 },
	applyBtn: { borderRadius: 14, paddingVertical: 15, alignItems: "center" },
	applyText: { color: "#fff", fontSize: 16, fontFamily: Fonts.displayBold },
});
