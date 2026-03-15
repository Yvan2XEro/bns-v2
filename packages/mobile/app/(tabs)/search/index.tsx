import { Ionicons } from "@expo/vector-icons";
import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { router, useFocusEffect, useLocalSearchParams } from "expo-router";
import React, { useCallback, useRef, useState } from "react";
import {
	ActivityIndicator,
	FlatList,
	Pressable,
	RefreshControl,
	StyleSheet,
	Text,
	TextInput,
	View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Fonts } from "@/constants/theme";
import { useColorScheme } from "@/hooks/use-color-scheme";
import { EmptyState } from "@/src/components/EmptyState";
import { ListingCard } from "@/src/components/ListingCard";
import { SkeletonCard } from "@/src/components/SkeletonCard";
import { api } from "@/src/lib/api";
import { useAuth } from "@/src/lib/auth";

const SORTS = [
	{ key: "newest", label: "Récents", icon: "time-outline" as const },
	{ key: "price_asc", label: "Prix ↑", icon: "trending-up-outline" as const },
	{
		key: "price_desc",
		label: "Prix ↓",
		icon: "trending-down-outline" as const,
	},
];

export default function SearchScreen() {
	const isDark = useColorScheme() === "dark";
	const { user } = useAuth();
	const params = useLocalSearchParams<{ q?: string; category?: string }>();

	const [query, setQuery] = useState(params.q ?? "");
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

	const searchParams: Record<string, string> = {
		sort,
		...(debouncedQuery ? { q: debouncedQuery } : {}),
		...(params.category ? { category: params.category } : {}),
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
		refetch,
	} = useInfiniteQuery({
		queryKey: ["search", searchParams],
		queryFn: ({ pageParam = 0 }) =>
			api.get<{ hits: any[]; total: number }>(
				`/api/public/search?${queryString}&limit=20&offset=${pageParam}`,
			),
		getNextPageParam: (lastPage, pages) => {
			const offset = pages.length * 20;
			return offset < lastPage.total ? offset : undefined;
		},
		initialPageParam: 0,
	});

	const { data: favData } = useQuery({
		queryKey: ["favorites"],
		queryFn: () => api.get<{ docs: any[] }>("/api/favorites?limit=200"),
		enabled: !!user,
	});

	const listings = (data?.pages.flatMap((p) => p.hits) ?? [])
		.filter(Boolean)
		.map((l: any) => ({
			...l,
			isBoosted: !!(l.boostedUntil && new Date(l.boostedUntil) > new Date()),
		}));
	const totalDocs = data?.pages[0]?.total ?? 0;
	const favoriteIds = new Set(
		(favData?.docs ?? []).map((f: any) => f.listing?.id ?? f.listing),
	);

	const [refreshing, setRefreshing] = React.useState(false);
	const onRefresh = async () => {
		setRefreshing(true);
		await refetch();
		setRefreshing(false);
	};

	const pairs: any[][] = [];
	for (let i = 0; i < listings.length; i += 2) {
		pairs.push(listings.slice(i, i + 2));
	}

	const bg = isDark ? "#0b1120" : "#f8fafc";
	const cardBg = isDark ? "#1e293b" : "#ffffff";
	const textColor = isDark ? "#e2e8f0" : "#0f172a";
	const mutedColor = isDark ? "#94a3b8" : "#64748b";
	const primaryColor = isDark ? "#3b82f6" : "#1e40af";
	const borderColor = isDark ? "#1e3a5f" : "#e2e8f0";
	const accentBg = isDark ? "#111827" : "#eef2ff";

	const renderRow = ({ item }: { item: any[] }) => (
		<View style={styles.row}>
			{item.map((listing: any) => (
				<ListingCard
					key={listing.id}
					listing={listing}
					isFavorite={favoriteIds.has(listing.id)}
					onToggleFavorite={() => {}}
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
						Rechercher
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
						placeholder="Voitures, téléphones, maisons…"
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
							onPress={() => router.push("/filters")}
							style={[
								styles.filterIconBtn,
								{ backgroundColor: isDark ? "#334155" : "#f1f5f9" },
							]}
							hitSlop={8}
						>
							<Ionicons name="options" size={15} color={primaryColor} />
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
							onPress={() => router.push("/filters")}
							style={[
								styles.filtersBtn,
								{
									backgroundColor: isDark ? "#1e293b" : "#f1f5f9",
									borderColor,
								},
							]}
						>
							<Ionicons name="options" size={14} color={mutedColor} />
							<Text
								style={[
									styles.filtersText,
									{ color: mutedColor, fontFamily: Fonts.body },
								]}
							>
								Filtres
							</Text>
						</Pressable>
					)}
				</View>

				{/* Results */}
				{isLoading ? (
					<View style={styles.skeletonGrid}>
						{Array.from({ length: 8 }).map((_, i) => (
							<SkeletonCard key={i} />
						))}
					</View>
				) : listings.length === 0 ? (
					<EmptyState
						icon="search-outline"
						title="Aucun résultat"
						subtitle="Essayez d'autres mots-clés ou filtres"
						ctaLabel="Effacer les filtres"
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
			{(query || params.category) && user && (
				<Pressable
					style={[styles.fab, { backgroundColor: primaryColor }]}
					onPress={() => {
						// TODO: save search dialog
					}}
				>
					<Ionicons name="bookmark" size={18} color="#fff" />
					<Text style={[styles.fabText, { fontFamily: Fonts.displayBold }]}>
						Sauvegarder
					</Text>
				</Pressable>
			)}
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
});
