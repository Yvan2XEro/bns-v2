import { Ionicons } from "@expo/vector-icons";
import { useInfiniteQuery, useMutation } from "@tanstack/react-query";
import { router, useFocusEffect, useLocalSearchParams } from "expo-router";
import React, { useCallback, useRef, useState } from "react";
import {
	ActivityIndicator,
	FlatList,
	KeyboardAvoidingView,
	Modal,
	Platform,
	Pressable,
	RefreshControl,
	StyleSheet,
	Text,
	TextInput,
	View,
} from "react-native";
import {
	SafeAreaView,
	useSafeAreaInsets,
} from "react-native-safe-area-context";
import { Fonts } from "@/constants/theme";
import { useColorScheme } from "@/hooks/use-color-scheme";
import { EmptyState } from "@/src/components/EmptyState";
import { ListingCard } from "@/src/components/ListingCard";
import { SkeletonCard } from "@/src/components/SkeletonCard";
import { useFavoriteActions } from "@/src/hooks/useFavorites";
import { chunkIntoRows, useResponsive } from "@/src/hooks/useResponsive";
import { api } from "@/src/lib/api";
import { useAuth } from "@/src/lib/auth";
import { useTranslation } from "@/src/lib/i18n";

export default function SearchScreen() {
	const isDark = useColorScheme() === "dark";
	const { t } = useTranslation();
	const insets = useSafeAreaInsets();
	const { user } = useAuth();
	const params = useLocalSearchParams();
	const { isTablet, columns, cardWidth, dialogMaxWidth } = useResponsive();

	const SORTS = [
		{
			key: "newest",
			label: t("search.sortNewest"),
			icon: "time-outline" as const,
		},
		{
			key: "price_asc",
			label: t("search.sortPriceAsc"),
			icon: "trending-up-outline" as const,
		},
		{
			key: "price_desc",
			label: t("search.sortPriceDesc"),
			icon: "trending-down-outline" as const,
		},
	];

	const [query, setQuery] = useState((params.q as string) ?? "");
	const [sort, setSort] = useState("newest");
	const [debouncedQuery, setDebouncedQuery] = useState(query);
	const debounceRef = useRef<ReturnType<typeof setTimeout> | undefined>(
		undefined,
	);
	const inputRef = useRef<TextInput>(null);

	useFocusEffect(
		useCallback(() => {
			if (params.q) inputRef.current?.focus();
		}, [params.q]),
	);

	const handleQueryChange = (text: string) => {
		setQuery(text);
		clearTimeout(debounceRef.current);
		debounceRef.current = setTimeout(() => setDebouncedQuery(text), 300);
	};

	// Extraire les attr_* depuis les params URL
	const attrParams: Record<string, string> = {};
	for (const [key, value] of Object.entries(params)) {
		if (key.startsWith("attr_") && typeof value === "string" && value) {
			attrParams[key] = value;
		}
	}

	const activeFilterCount = [
		params.category,
		params.minPrice,
		params.maxPrice,
		params.conditions,
		params.tags,
		params.location,
		...Object.values(attrParams),
	].filter(Boolean).length;

	const openFilters = () =>
		router.push({
			pathname: "/filters",
			params: {
				returnTo: "/(tabs)/search",
				category: (params.category as string) ?? "",
				minPrice: (params.minPrice as string) ?? "",
				maxPrice: (params.maxPrice as string) ?? "",
				conditions: (params.conditions as string) ?? "",
				tags: (params.tags as string) ?? "",
				location: (params.location as string) ?? "",
				radius: (params.radius as string) ?? "",
				...attrParams,
			},
		});

	const searchParams: Record<string, string> = {
		sort,
		...(debouncedQuery ? { q: debouncedQuery } : {}),
		...(params.category ? { category: params.category as string } : {}),
		...(params.minPrice ? { minPrice: params.minPrice as string } : {}),
		...(params.maxPrice ? { maxPrice: params.maxPrice as string } : {}),
		...(params.conditions ? { condition: params.conditions as string } : {}),
		...(params.tags ? { tags: params.tags as string } : {}),
		...(params.location ? { location: params.location as string } : {}),
		...(params.location && params.radius
			? { radius: params.radius as string }
			: {}),
		...attrParams,
	};
	const queryString = Object.entries(searchParams)
		.map(([k, v]) => `${k}=${encodeURIComponent(v)}`)
		.join("&");

	const {
		data,
		fetchNextPage,
		hasNextPage,
		isFetchingNextPage,
		isLoading,
		isError,
		refetch,
	} = useInfiniteQuery({
		queryKey: ["search", searchParams],
		queryFn: ({ pageParam = 0 }) =>
			api.get<{ hits: any[]; total: number }>(
				`/api/public/search?${queryString}&limit=20&offset=${pageParam}`,
			),
		getNextPageParam: (lastPage, pages) => {
			const offset = pages.length * 20;
			// The endpoint can answer with a bare array, and a page can be null;
			// reading `.total` off either throws inside TanStack's pagination path.
			const total = Array.isArray(lastPage)
				? lastPage.length
				: (lastPage?.total ?? 0);
			return offset < total ? offset : undefined;
		},
		initialPageParam: 0,
	});

	const { favoriteIds, toggleFavorite } = useFavoriteActions();

	const listings = (
		data?.pages.flatMap((p: any) => (Array.isArray(p) ? p : (p?.hits ?? []))) ??
		[]
	)
		.filter(Boolean)
		.map((l: any) => ({
			...l,
			isBoosted: !!(l.boostedUntil && new Date(l.boostedUntil) > new Date()),
		}));
	const totalDocs = data?.pages[0]?.total ?? 0;
	const [refreshing, setRefreshing] = React.useState(false);
	const onRefresh = async () => {
		setRefreshing(true);
		await refetch();
		setRefreshing(false);
	};

	const pairs = chunkIntoRows(listings, columns);

	const bg = isDark ? "#0b1120" : "#f8fafc";
	const cardBg = isDark ? "#1e293b" : "#ffffff";
	const textColor = isDark ? "#e2e8f0" : "#0f172a";
	const mutedColor = isDark ? "#94a3b8" : "#64748b";
	const primaryColor = isDark ? "#3b82f6" : "#1e40af";
	const borderColor = isDark ? "#1e3a5f" : "#e2e8f0";
	const accentBg = isDark ? "#111827" : "#eef2ff";

	// ── Save search dialog ─────────────────────────────────────────
	const [saveDialogOpen, setSaveDialogOpen] = useState(false);
	const [saveName, setSaveName] = useState("");
	const [saveStatus, setSaveStatus] = useState<"idle" | "saving" | "saved">(
		"idle",
	);

	const { mutate: saveSearch } = useMutation({
		mutationFn: () => {
			const urlParams = new URLSearchParams();
			if (debouncedQuery) urlParams.set("q", debouncedQuery);
			for (const [k, v] of Object.entries(searchParams)) {
				if (v && k !== "sort") urlParams.set(k, v);
			}
			return api.post("/api/saved-searches", {
				name: saveName.trim() || debouncedQuery || t("search.saveSearch"),
				query: debouncedQuery,
				filters: {
					category: params.category,
					minPrice: params.minPrice,
					maxPrice: params.maxPrice,
					conditions: params.conditions,
					location: params.location,
					sort,
					...attrParams,
				},
				url: `/search?${urlParams.toString()}`,
			});
		},
		onSuccess: () => {
			setSaveStatus("saved");
			setTimeout(() => {
				setSaveDialogOpen(false);
				setSaveStatus("idle");
				setSaveName("");
			}, 1200);
		},
		onError: () => setSaveStatus("idle"),
	});

	const openSaveDialog = () => {
		setSaveName(debouncedQuery || "");
		setSaveStatus("idle");
		setSaveDialogOpen(true);
	};

	const renderRow = ({ item }: { item: any[] }) => (
		<View style={styles.row}>
			{item.map((listing: any) => (
				<ListingCard
					key={listing.id}
					listing={listing}
					width={cardWidth}
					isFavorite={favoriteIds.has(listing.id)}
					onToggleFavorite={() => toggleFavorite(listing)}
					onPress={(id: string) => router.push(`/listing/${id}`)}
				/>
			))}
		</View>
	);

	const hasActiveSearch = !!(debouncedQuery || params.category);

	return (
		<SafeAreaView
			edges={["top"]}
			style={[styles.safe, { backgroundColor: accentBg }]}
		>
			{/* ── Header ── */}
			<View style={[styles.header, { backgroundColor: accentBg }]}>
				<View style={styles.titleRow}>
					<Text style={[styles.pageTitle, { color: textColor }]}>
						{t("search.title")}
					</Text>
					{hasActiveSearch && listings.length > 0 && !isLoading && (
						<View
							style={[styles.countBadge, { backgroundColor: primaryColor }]}
						>
							<Text style={styles.countText}>{totalDocs}</Text>
						</View>
					)}
				</View>

				{/* Search input */}
				<View
					style={[
						styles.searchWrap,
						{
							backgroundColor: cardBg,
							shadowColor: isDark ? "#000" : "#94a3b8",
						},
					]}
				>
					<View
						style={[styles.searchIconCircle, { backgroundColor: primaryColor }]}
					>
						<Ionicons name="search" size={15} color="#fff" />
					</View>
					<TextInput
						ref={inputRef}
						value={query}
						onChangeText={handleQueryChange}
						placeholder={t("home.searchPlaceholderDetailed")}
						placeholderTextColor={mutedColor}
						style={[
							styles.searchInput,
							{ color: textColor, fontFamily: Fonts.body },
						]}
						returnKeyType="search"
					/>
					{query.length > 0 ? (
						<Pressable
							onPress={() => {
								setQuery("");
								setDebouncedQuery("");
							}}
							hitSlop={10}
							style={[
								styles.clearBtn,
								{ backgroundColor: isDark ? "#334155" : "#f1f5f9" },
							]}
						>
							<Ionicons name="close" size={13} color={mutedColor} />
						</Pressable>
					) : (
						<Pressable
							onPress={openFilters}
							style={[
								styles.filterIconBtn,
								{
									backgroundColor:
										activeFilterCount > 0
											? primaryColor
											: isDark
												? "#334155"
												: "#f1f5f9",
								},
							]}
							hitSlop={8}
						>
							<Ionicons
								name="options"
								size={15}
								color={activeFilterCount > 0 ? "#fff" : primaryColor}
							/>
						</Pressable>
					)}
				</View>
			</View>

			{/* ── Content area ── */}
			<View style={[styles.content, { backgroundColor: bg }]}>
				{/* Sort bar */}
				<View style={[styles.sortBar, { borderBottomColor: borderColor }]}>
					<View style={styles.sortPills}>
						{SORTS.map((s) => {
							const active = sort === s.key;
							return (
								<Pressable
									key={s.key}
									onPress={() => setSort(s.key)}
									style={[
										styles.sortPill,
										{
											backgroundColor: active
												? primaryColor
												: isDark
													? "#1e293b"
													: "#f1f5f9",
											borderColor: active ? primaryColor : "transparent",
										},
									]}
								>
									<Ionicons
										name={s.icon}
										size={12}
										color={active ? "#fff" : mutedColor}
									/>
									<Text
										style={[
											styles.sortText,
											{
												color: active ? "#fff" : mutedColor,
												fontFamily: Fonts.bodySemibold,
											},
										]}
									>
										{s.label}
									</Text>
								</Pressable>
							);
						})}
					</View>
					{query.length > 0 && (
						<Pressable
							onPress={openFilters}
							style={[
								styles.filtersBtn,
								{
									backgroundColor:
										activeFilterCount > 0
											? primaryColor
											: isDark
												? "#1e293b"
												: "#f1f5f9",
									borderColor:
										activeFilterCount > 0 ? primaryColor : borderColor,
								},
							]}
						>
							<Ionicons
								name="options"
								size={14}
								color={activeFilterCount > 0 ? "#fff" : mutedColor}
							/>
							<Text
								style={[
									styles.filtersText,
									{
										color: activeFilterCount > 0 ? "#fff" : mutedColor,
										fontFamily: Fonts.body,
									},
								]}
							>
								{activeFilterCount > 0
									? t("search.filtersCount", { count: activeFilterCount })
									: t("search.filters")}
							</Text>
						</Pressable>
					)}
				</View>

				{/* Results */}
				{isLoading ? (
					<View style={styles.skeletonGrid}>
						{Array.from({ length: columns * 4 }).map((_, i) => (
							<SkeletonCard key={i} cardWidth={cardWidth} />
						))}
					</View>
				) : isError ? (
					// Without this a network failure / 401 / 500 rendered the
					// "no results" state, which reads as "nothing matches".
					<EmptyState
						icon="cloud-offline-outline"
						title={t("home.errorTitle")}
						subtitle={t("home.errorSub")}
						ctaLabel={t("common.retry")}
						onCta={() => refetch()}
					/>
				) : listings.length === 0 ? (
					<EmptyState
						icon="search-outline"
						title={t("search.noResults")}
						subtitle={t("search.noResultsHint")}
						ctaLabel={t("search.clearFilters")}
						onCta={() => {
							setQuery("");
							setDebouncedQuery("");
						}}
					/>
				) : (
					<FlatList
						data={pairs}
						renderItem={renderRow}
						keyExtractor={(_, i) => String(i)}
						contentContainerStyle={styles.list}
						refreshControl={
							<RefreshControl
								refreshing={refreshing}
								onRefresh={onRefresh}
								tintColor={primaryColor}
							/>
						}
						onEndReached={() =>
							hasNextPage && !isFetchingNextPage && fetchNextPage()
						}
						onEndReachedThreshold={0.5}
						ListFooterComponent={
							isFetchingNextPage ? (
								<ActivityIndicator
									color={primaryColor}
									style={{ margin: 16 }}
								/>
							) : null
						}
						showsVerticalScrollIndicator={false}
					/>
				)}
			</View>

			{/* Save Search FAB */}
			{(debouncedQuery || activeFilterCount > 0) && user && (
				<Pressable
					style={[styles.fab, { backgroundColor: primaryColor }]}
					onPress={openSaveDialog}
				>
					<Ionicons name="bookmark" size={18} color="#fff" />
					<Text style={[styles.fabText, { fontFamily: Fonts.displayBold }]}>
						{t("search.save")}
					</Text>
				</Pressable>
			)}

			{/* Save dialog */}
			<Modal
				visible={saveDialogOpen}
				transparent
				animationType="fade"
				onRequestClose={() => setSaveDialogOpen(false)}
			>
				<KeyboardAvoidingView
					behavior={Platform.OS === "ios" ? "padding" : "height"}
					style={[
						styles.modalOverlay,
						{ paddingBottom: insets.bottom + 32 },
						// Centred dialog on iPad instead of a 1024pt-wide sheet.
						isTablet && { justifyContent: "center", alignItems: "center" },
					]}
				>
					<Pressable
						style={StyleSheet.absoluteFill}
						onPress={() => setSaveDialogOpen(false)}
					/>
					<View
						style={[
							styles.modalCard,
							{ backgroundColor: cardBg, borderColor },
							isTablet && { width: "100%", maxWidth: dialogMaxWidth },
						]}
					>
						<Text style={[styles.modalTitle, { color: textColor }]}>
							{t("search.saveSearchTitle")}
						</Text>
						<Text style={[styles.modalSub, { color: mutedColor }]}>
							{t("search.saveSearchSub")}
						</Text>

						<TextInput
							value={saveName}
							onChangeText={setSaveName}
							placeholder={
								debouncedQuery || t("search.saveSearchPlaceholderFallback")
							}
							placeholderTextColor={mutedColor}
							autoFocus
							style={[
								styles.modalInput,
								{
									color: textColor,
									borderColor: primaryColor,
									backgroundColor: isDark ? "#0b1120" : "#f8fafc",
								},
							]}
							returnKeyType="done"
							onSubmitEditing={() => saveStatus === "idle" && saveSearch()}
						/>

						<View style={styles.modalActions}>
							<Pressable
								onPress={() => setSaveDialogOpen(false)}
								style={[
									styles.modalBtn,
									{ backgroundColor: isDark ? "#1e293b" : "#f1f5f9" },
								]}
							>
								<Text style={[styles.modalBtnText, { color: mutedColor }]}>
									{t("common.cancel")}
								</Text>
							</Pressable>

							<Pressable
								onPress={() => saveStatus === "idle" && saveSearch()}
								disabled={saveStatus !== "idle"}
								style={[
									styles.modalBtn,
									styles.modalBtnPrimary,
									{
										backgroundColor:
											saveStatus === "saved" ? "#16a34a" : primaryColor,
									},
								]}
							>
								{saveStatus === "saving" ? (
									<ActivityIndicator size="small" color="#fff" />
								) : saveStatus === "saved" ? (
									<>
										<Ionicons name="checkmark" size={15} color="#fff" />
										<Text style={styles.modalBtnTextPrimary}>
											{t("search.saved")}
										</Text>
									</>
								) : (
									<>
										<Ionicons name="bookmark" size={15} color="#fff" />
										<Text style={styles.modalBtnTextPrimary}>
											{t("search.save")}
										</Text>
									</>
								)}
							</Pressable>
						</View>
					</View>
				</KeyboardAvoidingView>
			</Modal>
		</SafeAreaView>
	);
}

const styles = StyleSheet.create({
	safe: { flex: 1 },
	header: {
		paddingHorizontal: 16,
		paddingTop: 8,
		paddingBottom: 16,
	},
	titleRow: {
		flexDirection: "row",
		alignItems: "center",
		gap: 8,
		marginBottom: 12,
	},
	pageTitle: {
		fontSize: 26,
		fontFamily: Fonts.displayExtrabold,
		letterSpacing: -0.5,
	},
	countBadge: {
		borderRadius: 10,
		paddingHorizontal: 8,
		paddingVertical: 2,
		minWidth: 28,
		alignItems: "center",
	},
	countText: {
		color: "#fff",
		fontSize: 12,
		fontFamily: Fonts.displayBold,
	},
	searchWrap: {
		flexDirection: "row",
		alignItems: "center",
		gap: 10,
		borderRadius: 16,
		paddingHorizontal: 10,
		paddingVertical: 8,
		shadowOffset: { width: 0, height: 3 },
		shadowOpacity: 0.12,
		shadowRadius: 8,
		elevation: 4,
	},
	searchIconCircle: {
		width: 30,
		height: 30,
		borderRadius: 10,
		alignItems: "center",
		justifyContent: "center",
	},
	searchInput: {
		flex: 1,
		fontSize: 15,
		paddingVertical: 4,
	},
	clearBtn: {
		width: 24,
		height: 24,
		borderRadius: 12,
		alignItems: "center",
		justifyContent: "center",
	},
	filterIconBtn: {
		width: 30,
		height: 30,
		borderRadius: 10,
		alignItems: "center",
		justifyContent: "center",
	},
	content: {
		flex: 1,
		borderTopLeftRadius: 20,
		borderTopRightRadius: 20,
		overflow: "hidden",
	},
	sortBar: {
		flexDirection: "row",
		alignItems: "center",
		justifyContent: "space-between",
		paddingHorizontal: 16,
		paddingVertical: 10,
		borderBottomWidth: 1,
	},
	sortPills: {
		flexDirection: "row",
		gap: 6,
	},
	sortPill: {
		flexDirection: "row",
		alignItems: "center",
		gap: 4,
		borderRadius: 20,
		paddingHorizontal: 10,
		paddingVertical: 6,
	},
	sortText: { fontSize: 12 },
	filtersBtn: {
		flexDirection: "row",
		alignItems: "center",
		gap: 4,
		borderRadius: 20,
		borderWidth: 1,
		paddingHorizontal: 10,
		paddingVertical: 6,
	},
	filtersText: { fontSize: 12 },
	list: { padding: 16, gap: 12 },
	row: { flexDirection: "row", gap: 12, marginBottom: 0 },
	skeletonGrid: {
		flexDirection: "row",
		flexWrap: "wrap",
		padding: 16,
		gap: 12,
	},
	fab: {
		position: "absolute",
		bottom: 20,
		right: 16,
		flexDirection: "row",
		alignItems: "center",
		gap: 6,
		borderRadius: 24,
		paddingHorizontal: 16,
		paddingVertical: 12,
		shadowColor: "#000",
		shadowOffset: { width: 0, height: 4 },
		shadowOpacity: 0.2,
		shadowRadius: 8,
		elevation: 8,
	},
	fabText: { color: "#fff", fontSize: 14 },

	// Modal
	modalOverlay: {
		flex: 1,
		backgroundColor: "rgba(0,0,0,0.5)",
		justifyContent: "flex-end",
		// paddingBottom is applied inline from the safe-area insets.
		paddingHorizontal: 16,
	},
	modalCard: {
		borderRadius: 20,
		borderWidth: 1,
		padding: 20,
		gap: 12,
		shadowColor: "#000",
		shadowOffset: { width: 0, height: -4 },
		shadowOpacity: 0.12,
		shadowRadius: 16,
		elevation: 10,
	},
	modalTitle: {
		fontSize: 17,
		fontFamily: Fonts.displayBold,
	},
	modalSub: {
		fontSize: 13,
		fontFamily: Fonts.body,
		lineHeight: 18,
		marginTop: -4,
	},
	modalInput: {
		borderWidth: 1.5,
		borderRadius: 12,
		paddingHorizontal: 14,
		paddingVertical: 12,
		fontSize: 15,
		fontFamily: Fonts.body,
	},
	modalActions: {
		flexDirection: "row",
		gap: 10,
		marginTop: 4,
	},
	modalBtn: {
		flex: 1,
		flexDirection: "row",
		alignItems: "center",
		justifyContent: "center",
		gap: 6,
		borderRadius: 12,
		paddingVertical: 13,
	},
	modalBtnPrimary: {},
	modalBtnText: {
		fontSize: 14,
		fontFamily: Fonts.bodySemibold,
	},
	modalBtnTextPrimary: {
		color: "#fff",
		fontSize: 14,
		fontFamily: Fonts.displayBold,
	},
});
