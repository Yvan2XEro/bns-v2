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
import { useColorScheme } from "@/hooks/use-color-scheme";
import { EmptyState } from "@/src/components/EmptyState";
import { ListingCard } from "@/src/components/ListingCard";
import { api } from "@/src/lib/api";
import { useAuth } from "@/src/lib/auth";

const SORTS = [
	{ key: "-createdAt", label: "Nouveau" },
	{ key: "price", label: "Prix ↑" },
	{ key: "-price", label: "Prix ↓" },
];

export default function SearchScreen() {
	const isDark = useColorScheme() === "dark";
	const { user } = useAuth();
	const params = useLocalSearchParams<{ q?: string; category?: string }>();

	const [query, setQuery] = useState(params.q ?? "");
	const [sort, setSort] = useState("-createdAt");
	const [debouncedQuery, setDebouncedQuery] = useState(query);
	const debounceRef = useRef<ReturnType<typeof setTimeout>>();

	useFocusEffect(
		useCallback(() => {
			// Screen focused — could trigger auto-focus on mount
		}, []),
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
			api.get<{ docs: any[]; totalDocs: number }>(
				`/api/public/search?${queryString}&limit=20&offset=${pageParam}`,
			),
		getNextPageParam: (lastPage, pages) => {
			const offset = pages.length * 20;
			return offset < lastPage.totalDocs ? offset : undefined;
		},
		initialPageParam: 0,
	});

	const { data: favData } = useQuery({
		queryKey: ["favorites"],
		queryFn: () => api.get<{ docs: any[] }>("/api/favorites?limit=200"),
		enabled: !!user,
	});

	const listings = data?.pages.flatMap((p) => p.docs) ?? [];
	const favoriteIds = new Set(
		(favData?.docs ?? []).map((f: any) => f.listing?.id ?? f.listing),
	);

	const [refreshing, setRefreshing] = React.useState(false);
	const onRefresh = async () => {
		setRefreshing(true);
		await refetch();
		setRefreshing(false);
	};

	// Group listings into pairs for 2-column layout
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

	return (
		<SafeAreaView style={[styles.safe, { backgroundColor: bg }]}>
			{/* Search Bar */}
			<View
				style={[
					styles.searchContainer,
					{ backgroundColor: bg, borderBottomColor: borderColor },
				]}
			>
				<View
					style={[styles.searchBar, { backgroundColor: cardBg, borderColor }]}
				>
					<Ionicons name="search" size={18} color={mutedColor} />
					<TextInput
						value={query}
						onChangeText={handleQueryChange}
						placeholder="Voitures, téléphones, maisons..."
						placeholderTextColor={mutedColor}
						style={[styles.input, { color: textColor }]}
						returnKeyType="search"
					/>
					{query.length > 0 && (
						<Pressable
							onPress={() => {
								setQuery("");
								setDebouncedQuery("");
							}}
							hitSlop={8}
						>
							<Ionicons name="close-circle" size={18} color={mutedColor} />
						</Pressable>
					)}
				</View>
			</View>

			{/* Sort Pills */}
			<View style={[styles.sortRow, { borderBottomColor: borderColor }]}>
				{SORTS.map((s) => (
					<Pressable
						key={s.key}
						onPress={() => setSort(s.key)}
						style={[
							styles.sortPill,
							{
								backgroundColor:
									sort === s.key
										? primaryColor
										: isDark
											? "#1e293b"
											: "#f1f5f9",
								borderColor: sort === s.key ? primaryColor : borderColor,
							},
						]}
					>
						<Text
							style={[
								styles.sortText,
								{ color: sort === s.key ? "#fff" : mutedColor },
							]}
						>
							{s.label}
						</Text>
					</Pressable>
				))}
				<View style={{ flex: 1 }} />
				<Pressable
					onPress={() => router.push("/filters")}
					style={[
						styles.filtersBtn,
						{ backgroundColor: isDark ? "#1e293b" : "#f1f5f9", borderColor },
					]}
				>
					<Ionicons name="options" size={16} color={mutedColor} />
					<Text style={[styles.filtersText, { color: mutedColor }]}>
						Filtres
					</Text>
				</Pressable>
			</View>

			{/* Results */}
			{isLoading ? (
				<View style={styles.loader}>
					<ActivityIndicator size="large" color={primaryColor} />
				</View>
			) : listings.length === 0 ? (
				<EmptyState
					emoji="🔍"
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
							<ActivityIndicator color={primaryColor} style={{ margin: 16 }} />
						) : null
					}
					showsVerticalScrollIndicator={false}
				/>
			)}

			{/* Save Search FAB */}
			{(query || params.category) && user && (
				<Pressable
					style={[styles.fab, { backgroundColor: primaryColor }]}
					onPress={() => {
						// TODO: save search dialog
					}}
				>
					<Ionicons name="bookmark" size={20} color="#fff" />
					<Text style={styles.fabText}>Sauvegarder</Text>
				</Pressable>
			)}
		</SafeAreaView>
	);
}

const styles = StyleSheet.create({
	safe: { flex: 1 },
	searchContainer: {
		paddingHorizontal: 16,
		paddingVertical: 8,
		borderBottomWidth: 1,
	},
	searchBar: {
		flexDirection: "row",
		alignItems: "center",
		gap: 10,
		borderRadius: 12,
		borderWidth: 1,
		paddingHorizontal: 12,
		paddingVertical: 10,
	},
	input: { flex: 1, fontSize: 15 },
	sortRow: {
		flexDirection: "row",
		alignItems: "center",
		paddingHorizontal: 16,
		paddingVertical: 8,
		gap: 8,
		borderBottomWidth: 1,
	},
	sortPill: {
		borderRadius: 20,
		borderWidth: 1,
		paddingHorizontal: 12,
		paddingVertical: 6,
	},
	sortText: { fontSize: 13, fontWeight: "600" },
	filtersBtn: {
		flexDirection: "row",
		alignItems: "center",
		gap: 4,
		borderRadius: 20,
		borderWidth: 1,
		paddingHorizontal: 12,
		paddingVertical: 6,
	},
	filtersText: { fontSize: 13 },
	list: { padding: 16, gap: 12 },
	row: { flexDirection: "row", gap: 12, marginBottom: 0 },
	loader: { flex: 1, alignItems: "center", justifyContent: "center" },
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
	fabText: { color: "#fff", fontWeight: "700", fontSize: 14 },
});
