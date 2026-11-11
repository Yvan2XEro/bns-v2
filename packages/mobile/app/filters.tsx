import { Ionicons } from "@expo/vector-icons";
import { useQuery } from "@tanstack/react-query";
import { router, useLocalSearchParams } from "expo-router";
import {
	type ComponentProps,
	type ReactNode,
	useEffect,
	useMemo,
	useState,
} from "react";
import {
	ActivityIndicator,
	Pressable,
	ScrollView,
	StyleSheet,
	Switch,
	Text,
	TextInput,
	View,
} from "react-native";
import {
	SafeAreaView,
	useSafeAreaInsets,
} from "react-native-safe-area-context";
import { Fonts } from "@/constants/theme";
import { CategoryField } from "@/src/components/CategorySheet";
import { CityPicker } from "@/src/components/CityPicker";
import { Chip } from "@/src/components/search/Chip";
import { useDiscoveryPalette } from "@/src/components/search/palette";
import { TagPicker } from "@/src/components/TagPicker";
import { useCategoryTags } from "@/src/hooks/useCategoryTags";
import {
	CATEGORIES_QUERY_KEY,
	CATEGORIES_STALE_TIME_MS,
} from "@/src/hooks/useListings";
import { useResponsive } from "@/src/hooks/useResponsive";
import { api } from "@/src/lib/api";
import { pruneTagSlugs } from "@/src/lib/categoryTags";
import { useTranslation } from "@/src/lib/i18n";
import { formatAttributeOptionLabel } from "@/src/lib/listingAttributes";
import type { Place } from "@/src/lib/places";

const RADIUS_OPTIONS = [5, 10, 25, 50, 100];

type IconName = ComponentProps<typeof Ionicons>["name"];

/** A form section: its title, then its control. */
function Section({ title, children }: { title: string; children: ReactNode }) {
	const c = useDiscoveryPalette();
	return (
		<View style={styles.section}>
			<Text
				style={[styles.sectionTitle, { color: c.foreground }]}
				accessibilityRole="header"
			>
				{title}
			</Text>
			{children}
		</View>
	);
}

/** An on/off filter as a native switch row: the whole row toggles it. */
function ToggleRow({
	icon,
	label,
	value,
	onChange,
}: {
	icon: IconName;
	label: string;
	value: boolean;
	onChange: (value: boolean) => void;
}) {
	const c = useDiscoveryPalette();
	return (
		<Pressable
			onPress={() => onChange(!value)}
			accessibilityRole="switch"
			accessibilityState={{ checked: value }}
			accessibilityLabel={label}
			style={({ pressed }) => [
				styles.toggleRow,
				pressed && { backgroundColor: c.well },
			]}
		>
			<View style={[styles.toggleIcon, { backgroundColor: c.primaryTint }]}>
				<Ionicons name={icon} size={18} color={c.link} />
			</View>
			<Text style={[styles.toggleText, { color: c.foreground }]}>{label}</Text>
			<Switch
				value={value}
				onValueChange={onChange}
				trackColor={{ true: c.primaryFill, false: c.borderStrong }}
				thumbColor="#ffffff"
				ios_backgroundColor={c.borderStrong}
				// The row carries the role and the label; the switch is its visual.
				accessibilityElementsHidden
				importantForAccessibility="no-hide-descendants"
			/>
		</Pressable>
	);
}

export default function FiltersModal() {
	const c = useDiscoveryPalette();
	const { centeredContent } = useResponsive();
	const { t } = useTranslation();
	const insets = useSafeAreaInsets();

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
	const [verifiedOnly, setVerifiedOnly] = useState(rawParams.verified === "1");
	const [orderableOnly, setOrderableOnly] = useState(
		rawParams.orderable === "1",
	);

	// Tags belong to categories: only the selected category's are offered, and
	// a picked tag the new category does not get is dropped.
	const { tags: availableTags, loaded: tagsLoaded } =
		useCategoryTags(selectedCategory);
	useEffect(() => {
		if (!tagsLoaded) return;
		setSelectedTags((slugs) => pruneTagSlugs(slugs, availableTags));
	}, [tagsLoaded, availableTags]);

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

	// ── Catégories + attributs ──────────────────────────────────
	const { data: catsData } = useQuery({
		queryKey: CATEGORIES_QUERY_KEY,
		queryFn: () => api.get<{ categories: any[] }>("/api/public/categories"),
		staleTime: CATEGORIES_STALE_TIME_MS,
	});
	const categories = catsData?.categories ?? [];

	const selectedCategoryObject = useMemo(
		() =>
			selectedCategory
				? categories.find((cat: any) => String(cat.id) === selectedCategory)
				: undefined,
		[selectedCategory, categories],
	);

	const categoryAttributes = useMemo(
		() =>
			((selectedCategoryObject?.attributes ?? []) as any[]).filter(
				(a: any) => a.filterable !== false,
			),
		[selectedCategoryObject],
	);

	const selectedCategoryName = selectedCategoryObject?.name ?? "";

	const chooseCategory = (id: string) => {
		setSelectedCategory(id);
		setAttributeFilters({});
	};

	// ── Handlers ────────────────────────────────────────────────
	const buildFilterParams = () => {
		const filterParams: Record<string, string> = {};
		if (selectedCategory) filterParams.category = selectedCategory;
		if (minPrice) filterParams.minPrice = minPrice;
		if (maxPrice) filterParams.maxPrice = maxPrice;
		if (selectedCategory && selectedTags.length)
			filterParams.tags = selectedTags.join(",");
		if (verifiedOnly) filterParams.verified = "1";
		if (location) filterParams.location = location;
		if (location) filterParams.radius = String(radius);
		if (location && locationLat != null) filterParams.lat = String(locationLat);
		if (location && locationLng != null) filterParams.lng = String(locationLng);
		if (orderableOnly) filterParams.orderable = "1";
		for (const [slug, value] of Object.entries(attributeFilters)) {
			if (value) filterParams[`attr_${slug}`] = value;
		}
		return filterParams;
	};

	// The apply button says how many listings it leads to, so a filter that
	// empties the results is seen before leaving the sheet.
	const countParams = (() => {
		const { verified, ...rest } = buildFilterParams();
		return new URLSearchParams({
			...rest,
			...(verified ? { minShopLevel: "2" } : {}),
			limit: "0",
		}).toString();
	})();
	const [debouncedCount, setDebouncedCount] = useState(countParams);
	useEffect(() => {
		const timer = setTimeout(() => setDebouncedCount(countParams), 300);
		return () => clearTimeout(timer);
	}, [countParams]);
	const { data: countData, isFetching: countFetching } = useQuery({
		queryKey: ["listings", "count", debouncedCount],
		queryFn: () =>
			api.get<{ total: number }>(`/api/public/search?${debouncedCount}`),
		staleTime: 60_000,
	});
	const total = countData?.total;
	const countPending = countFetching || debouncedCount !== countParams;

	const handleApply = () => {
		const filterParams = buildFilterParams();
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
		setSelectedTags([]);
		setLocation("");
		setLocationLat(null);
		setLocationLng(null);
		setRadius(10);
		setAttributeFilters({});
		setVerifiedOnly(false);
		setOrderableOnly(false);
	};

	const activeCount = [
		selectedCategory,
		minPrice,
		maxPrice,
		selectedTags.length > 0,
		location,
		verifiedOnly,
		orderableOnly,
		...Object.values(attributeFilters).filter(Boolean),
	].filter(Boolean).length;

	const sheetColors = {
		cardBg: c.card,
		textColor: c.foreground,
		mutedColor: c.mutedForeground,
		primary: c.primary,
		fill: c.primaryFill,
		link: c.link,
		border: c.border,
		isDark: c.isDark,
		inputBg: c.well,
	};

	const fieldStyle = [
		styles.input,
		{
			backgroundColor: c.card,
			borderColor: c.borderStrong,
			color: c.foreground,
		},
	];

	// ── Render ──────────────────────────────────────────────────
	return (
		<SafeAreaView
			edges={["top"]}
			style={[styles.safe, { backgroundColor: c.background }]}
		>
			<View style={[styles.header, { borderBottomColor: c.border }]}>
				<Pressable
					onPress={() => router.dismiss()}
					accessibilityRole="button"
					accessibilityLabel={t("common.close")}
					style={styles.headerBtn}
				>
					<Ionicons name="close" size={24} color={c.foreground} />
				</Pressable>
				<Text
					style={[styles.title, { color: c.foreground }]}
					accessibilityRole="header"
					numberOfLines={1}
				>
					{t("filters.title")}
				</Text>
				<Pressable
					onPress={handleReset}
					disabled={activeCount === 0}
					accessibilityRole="button"
					accessibilityState={{ disabled: activeCount === 0 }}
					style={[styles.resetBtn, activeCount === 0 && styles.disabled]}
				>
					<Text style={[styles.resetText, { color: c.link }]}>
						{t("filters.reset")}
					</Text>
				</Pressable>
			</View>

			<ScrollView
				contentContainerStyle={[styles.scroll, centeredContent]}
				keyboardShouldPersistTaps="handled"
				keyboardDismissMode="on-drag"
			>
				{/* ── Catégorie ── */}
				<Section title={t("filters.category")}>
					<CategoryField
						categories={categories}
						value={selectedCategoryObject}
						onSelect={(cat: any) => chooseCategory(String(cat.id))}
						onClear={() => chooseCategory("")}
						colors={sheetColors}
					/>
				</Section>

				{/* ── Prix ── */}
				<Section title={t("filters.price")}>
					<View style={styles.priceRow}>
						<TextInput
							value={minPrice}
							onChangeText={(v) => setMinPrice(v.replace(/[^0-9]/g, ""))}
							placeholder={t("filters.minPrice")}
							placeholderTextColor={c.mutedForeground}
							accessibilityLabel={t("filters.minPrice")}
							style={fieldStyle}
							keyboardType="number-pad"
							returnKeyType="done"
						/>
						<Text style={[styles.priceSep, { color: c.mutedForeground }]}>
							–
						</Text>
						<TextInput
							value={maxPrice}
							onChangeText={(v) => setMaxPrice(v.replace(/[^0-9]/g, ""))}
							placeholder={t("filters.maxPrice")}
							placeholderTextColor={c.mutedForeground}
							accessibilityLabel={t("filters.maxPrice")}
							style={fieldStyle}
							keyboardType="number-pad"
							returnKeyType="done"
						/>
					</View>
				</Section>

				{/* ── Vendeurs vérifiés, achat en ligne ── */}
				<View
					style={[
						styles.toggleCard,
						{ backgroundColor: c.card, borderColor: c.border },
					]}
				>
					<ToggleRow
						icon="shield-checkmark-outline"
						label={t("filters.verified")}
						value={verifiedOnly}
						onChange={setVerifiedOnly}
					/>
					<View style={[styles.divider, { backgroundColor: c.border }]} />
					<ToggleRow
						icon="bag-check-outline"
						label={t("filters.orderable")}
						value={orderableOnly}
						onChange={setOrderableOnly}
					/>
				</View>

				{/* ── Tags ── */}
				{availableTags.length > 0 && (
					<Section title={t("filters.tags")}>
						<TagPicker
							selectedSlugs={selectedTags}
							onChangeSlugs={setSelectedTags}
							availableTags={availableTags}
							inputBg={c.card}
							borderColor={c.borderStrong}
							textColor={c.foreground}
							mutedColor={c.mutedForeground}
							primaryColor={c.primary}
						/>
					</Section>
				)}

				{/* ── Localisation + rayon ── */}
				<Section title={t("filters.location")}>
					<CityPicker
						value={location}
						onSelect={(place: Place) => {
							setLocation(place.name);
							setLocationLat(place.lat ?? null);
							setLocationLng(place.lng ?? null);
						}}
						onClear={() => {
							setLocation("");
							setLocationLat(null);
							setLocationLng(null);
						}}
						inputBg={c.card}
						borderColor={c.borderStrong}
						textColor={c.foreground}
						mutedColor={c.mutedForeground}
					/>
					{location.length > 0 && (
						<>
							<Text style={[styles.subLabel, { color: c.body }]}>
								{t("filters.radius")}
							</Text>
							<View style={styles.chipRow}>
								{RADIUS_OPTIONS.map((r) => (
									<Chip
										key={r}
										label={`${r} km`}
										selected={radius === r}
										onPress={() => setRadius(r)}
										accessibilityLabel={t(`filters.radius${r}`)}
									/>
								))}
							</View>
						</>
					)}
				</Section>

				{/* ── Attributs dynamiques de la catégorie ── */}
				{categoryAttributes.length > 0 && (
					<>
						<View style={[styles.divider, { backgroundColor: c.border }]} />
						<Text
							style={[styles.attrSectionHeader, { color: c.foreground }]}
							accessibilityRole="header"
						>
							{selectedCategoryName}
						</Text>

						{categoryAttributes.map((attr: any) => (
							<View key={attr.slug} style={styles.attrBlock}>
								<Text style={[styles.subLabel, { color: c.body }]}>
									{attr.name}
								</Text>

								{attr.type === "select" && attr.options ? (
									<View style={styles.chipRow}>
										{attr.options.map((opt: any) => {
											const active = attributeFilters[attr.slug] === opt.value;
											return (
												<Chip
													key={opt.value}
													label={formatAttributeOptionLabel(opt)}
													selected={active}
													onPress={() =>
														setAttributeFilters((prev) => ({
															...prev,
															[attr.slug]: active ? "" : opt.value,
														}))
													}
												/>
											);
										})}
									</View>
								) : attr.type === "boolean" ? (
									<View style={styles.chipRow}>
										{[
											{ label: t("common.yes"), value: "true" },
											{ label: t("common.no"), value: "false" },
										].map((opt) => {
											const active = attributeFilters[attr.slug] === opt.value;
											return (
												<Chip
													key={opt.value}
													label={opt.label}
													selected={active}
													onPress={() =>
														setAttributeFilters((prev) => ({
															...prev,
															[attr.slug]: active ? "" : opt.value,
														}))
													}
												/>
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
										placeholderTextColor={c.mutedForeground}
										accessibilityLabel={attr.name}
										keyboardType={
											attr.type === "number" ? "number-pad" : "default"
										}
										style={fieldStyle}
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
					{ borderTopColor: c.border, backgroundColor: c.card },
					// Clears the Android navigation bar / iOS home indicator. Without
					// this the Apply button sits under the system buttons.
					{ paddingBottom: insets.bottom + 12 },
				]}
			>
				<Pressable
					onPress={handleApply}
					accessibilityRole="button"
					accessibilityState={{ busy: countPending }}
					style={({ pressed }) => [
						styles.applyBtn,
						{ backgroundColor: c.primaryFill },
						pressed && styles.pressed,
					]}
				>
					{countPending && typeof total !== "number" ? (
						<ActivityIndicator color="#ffffff" />
					) : (
						<Text style={styles.applyText} numberOfLines={1}>
							{typeof total === "number"
								? t("filters.showCount", { count: total })
								: t("filters.apply")}
						</Text>
					)}
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
		gap: 8,
		paddingHorizontal: 8,
		minHeight: 56,
		borderBottomWidth: StyleSheet.hairlineWidth,
	},
	headerBtn: {
		width: 48,
		height: 48,
		alignItems: "center",
		justifyContent: "center",
	},
	title: {
		flex: 1,
		textAlign: "center",
		fontSize: 18,
		lineHeight: 23,
		letterSpacing: -0.2,
		fontFamily: Fonts.displayBold,
	},
	resetBtn: {
		minHeight: 48,
		justifyContent: "center",
		paddingHorizontal: 8,
	},
	resetText: { fontSize: 15, fontFamily: Fonts.bodySemibold },
	disabled: { opacity: 0.4 },
	scroll: { padding: 16, paddingBottom: 40, gap: 24 },

	section: { gap: 10 },
	sectionTitle: {
		fontSize: 17,
		lineHeight: 22,
		letterSpacing: -0.2,
		fontFamily: Fonts.displayBold,
	},
	subLabel: {
		fontSize: 14,
		fontFamily: Fonts.bodySemibold,
		marginTop: 4,
	},
	chipRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },

	// Prix
	priceRow: { flexDirection: "row", alignItems: "center", gap: 10 },
	priceSep: { fontSize: 18, fontFamily: Fonts.body },
	input: {
		flex: 1,
		minHeight: 48,
		borderRadius: 12,
		borderWidth: 1.5,
		paddingHorizontal: 14,
		paddingVertical: 10,
		fontSize: 16,
		fontFamily: Fonts.body,
	},

	// On/off filters
	toggleCard: {
		borderRadius: 14,
		borderWidth: StyleSheet.hairlineWidth,
		overflow: "hidden",
	},
	toggleRow: {
		flexDirection: "row",
		alignItems: "center",
		gap: 12,
		minHeight: 60,
		paddingHorizontal: 14,
		paddingVertical: 10,
	},
	toggleIcon: {
		width: 36,
		height: 36,
		borderRadius: 10,
		alignItems: "center",
		justifyContent: "center",
	},
	toggleText: {
		flex: 1,
		fontSize: 15,
		lineHeight: 20,
		fontFamily: Fonts.bodySemibold,
	},
	divider: { height: StyleSheet.hairlineWidth },

	// Section attributs dynamiques
	attrSectionHeader: {
		fontSize: 20,
		lineHeight: 25,
		letterSpacing: -0.4,
		fontFamily: Fonts.displayBold,
		marginBottom: -8,
	},
	attrBlock: { gap: 8 },

	// Footer
	footer: {
		paddingHorizontal: 16,
		paddingTop: 12,
		borderTopWidth: StyleSheet.hairlineWidth,
	},
	applyBtn: {
		minHeight: 52,
		borderRadius: 12,
		alignItems: "center",
		justifyContent: "center",
		paddingHorizontal: 16,
	},
	applyText: { color: "#ffffff", fontSize: 16, fontFamily: Fonts.bodyBold },
	pressed: { opacity: 0.85 },
});
