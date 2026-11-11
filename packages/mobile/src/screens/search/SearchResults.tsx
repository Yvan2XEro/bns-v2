import { FlashList } from "@shopify/flash-list";
import { useInfiniteQuery } from "@tanstack/react-query";
import { router, useFocusEffect, useLocalSearchParams } from "expo-router";
import React, { useCallback, useRef, useState } from "react";
import {
	ActivityIndicator,
	RefreshControl,
	StyleSheet,
	Text,
	type TextInput,
	View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Fonts } from "@/constants/theme";
import { EmptyState } from "@/src/components/EmptyState";
import { ListingCard } from "@/src/components/ListingCard";
import type { SplitListProps } from "@/src/components/layout/SplitScreen";
import { ListingGridSkeleton } from "@/src/components/listing/Skeletons";
import { SearchSegments } from "@/src/components/SearchSegments";
import { useDiscoveryPalette } from "@/src/components/search/palette";
import { FiltersButton, QueryField } from "@/src/components/search/QueryField";
import {
	SaveSearchButton,
	SaveSearchDialog,
} from "@/src/components/search/SaveSearch";
import {
	CategorySuggestions,
	RecentSearches,
} from "@/src/components/search/SearchSuggestions";
import { SortBar, type SortKey } from "@/src/components/search/SortBar";
import { ShopResults } from "@/src/components/shop/ShopResults";
import { useFavoriteActions } from "@/src/hooks/useFavorites";
import { useCategories } from "@/src/hooks/useListings";
import { useRecentSearches } from "@/src/hooks/useRecentSearches";
import { chunkIntoRows, useResponsive } from "@/src/hooks/useResponsive";
import { useShopSearch } from "@/src/hooks/useShops";
import { api } from "@/src/lib/api";
import { useAuth } from "@/src/lib/auth";
import { useTranslation } from "@/src/lib/i18n";
import type {
	ListingHit,
	ListingHitMapped,
	SearchResponse,
} from "@/src/types/api";
import { matchCategories } from "../../../../api/src/contracts/searchSuggest";

/**
 * Search: the query, its filters and the results. Inside the search tab's
 * split, a result opens beside the list on a tablet in landscape.
 */
export function SearchResults({ selectedId, onOpen }: SplitListProps) {
	const c = useDiscoveryPalette();
	const { t } = useTranslation();
	const { user } = useAuth();
	const params = useLocalSearchParams();
	const { columns, cardWidth } = useResponsive();

	const [query, setQuery] = useState((params.q as string) ?? "");
	const [sort, setSort] = useState<SortKey>("newest");
	const [debouncedQuery, setDebouncedQuery] = useState(query);
	const debounceRef = useRef<ReturnType<typeof setTimeout> | undefined>(
		undefined,
	);
	const inputRef = useRef<TextInput>(null);
	const [inputFocused, setInputFocused] = useState(false);
	const { recent, remember, remove, clear } = useRecentSearches();
	const { data: categoriesData } = useCategories();

	useFocusEffect(
		useCallback(() => {
			// Opened from the home's search field: the keyboard is already up.
			if (params.q || params.focus) inputRef.current?.focus();
		}, [params.q, params.focus]),
	);

	const handleQueryChange = (text: string) => {
		setQuery(text);
		clearTimeout(debounceRef.current);
		debounceRef.current = setTimeout(() => setDebouncedQuery(text), 300);
	};

	const runSearch = (text: string) => {
		clearTimeout(debounceRef.current);
		setQuery(text);
		setDebouncedQuery(text);
		remember(text);
		inputRef.current?.blur();
	};

	// Extraire les attr_* depuis les params URL
	const attrParams: Record<string, string> = {};
	for (const [key, value] of Object.entries(params)) {
		if (key.startsWith("attr_") && typeof value === "string" && value) {
			attrParams[key] = value;
		}
	}

	const verifiedOnly = params.verified === "1";
	const orderableOnly = params.orderable === "1";

	const activeFilterCount = [
		params.category,
		params.minPrice,
		params.maxPrice,
		params.category && params.tags,
		params.location,
		verifiedOnly,
		orderableOnly,
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
				tags: (params.tags as string) ?? "",
				location: (params.location as string) ?? "",
				radius: (params.radius as string) ?? "",
				verified: (params.verified as string) ?? "",
				orderable: (params.orderable as string) ?? "",
				...attrParams,
			},
		});

	// `minShopLevel` is the API's own floor — this only forwards the choice,
	// it never re-filters the results client-side (the route re-applies the
	// same floor after hydrating live shop data, since an indexed level can
	// be stale).
	const searchParams: Record<string, string> = {
		sort,
		...(debouncedQuery ? { q: debouncedQuery } : {}),
		...(params.category ? { category: params.category as string } : {}),
		...(params.minPrice ? { minPrice: params.minPrice as string } : {}),
		...(params.maxPrice ? { maxPrice: params.maxPrice as string } : {}),
		// Tags are category-scoped: without a category there is none to filter on.
		...(params.category && params.tags ? { tags: params.tags as string } : {}),
		...(params.location ? { location: params.location as string } : {}),
		...(params.location && params.radius
			? { radius: params.radius as string }
			: {}),
		...(verifiedOnly ? { minShopLevel: "2" } : {}),
		...(orderableOnly ? { orderable: "1" } : {}),
		...attrParams,
	};
	const queryString = Object.entries(searchParams)
		.map(([k, v]) => `${k}=${encodeURIComponent(v)}`)
		.join("&");

	const [segment, setSegment] = useState<"listings" | "shops">(
		params.segment === "shops" ? "shops" : "listings",
	);
	const shopParams: Record<string, string> = {
		...(debouncedQuery ? { q: debouncedQuery } : {}),
		...(params.location ? { city: params.location as string } : {}),
		...(params.category ? { category: params.category as string } : {}),
		...(verifiedOnly ? { minShopLevel: "2" } : {}),
	};
	// shopsEnabled gates *creating* a shop only — an existing shop stays
	// publicly findable with the flag off, so the segment and its count are
	// never conditioned on it.
	const shopCount = useShopSearch(shopParams, true);
	const shopTotal = shopCount.data?.pages[0]?.total ?? 0;

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
			api.get<SearchResponse | ListingHit[]>(
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

	const listings: ListingHitMapped[] = (
		data?.pages.flatMap((p) => (Array.isArray(p) ? p : (p?.hits ?? []))) ?? []
	)
		.filter(Boolean)
		.map((hit) => ({
			...hit,
			isBoosted: !!(
				hit.boostedUntil && new Date(hit.boostedUntil) > new Date()
			),
		}));
	const firstPage = data?.pages[0];
	const totalDocs = firstPage
		? Array.isArray(firstPage)
			? firstPage.length
			: (firstPage.total ?? 0)
		: 0;
	const [refreshing, setRefreshing] = React.useState(false);
	const onRefresh = async () => {
		setRefreshing(true);
		await refetch();
		setRefreshing(false);
	};

	const pairs = chunkIntoRows(listings, columns);

	// ── Save search dialog ─────────────────────────────────────────
	const [saveDialogOpen, setSaveDialogOpen] = useState(false);
	const savedFilters = {
		category: params.category,
		minPrice: params.minPrice,
		maxPrice: params.maxPrice,
		location: params.location,
		sort,
		...attrParams,
	};

	const renderRow = ({ item }: { item: ListingHitMapped[] }) => (
		<View style={styles.row}>
			{item.map((listing) => (
				<ListingCard
					key={listing.id}
					listing={listing}
					width={cardWidth}
					isFavorite={favoriteIds.has(listing.id)}
					onToggleFavorite={() => toggleFavorite({ ...listing })}
					selected={listing.id === selectedId}
					onPress={(id: string) => {
						remember(debouncedQuery);
						onOpen(id);
					}}
				/>
			))}
		</View>
	);

	const clearQuery = () => {
		clearTimeout(debounceRef.current);
		setQuery("");
		setDebouncedQuery("");
	};

	// "Clear filters" clears them all, query included: clearing the text alone
	// left a filtered search that still matched nothing.
	const clearAll = () => {
		clearQuery();
		const reset: Record<string, undefined> = {
			category: undefined,
			minPrice: undefined,
			maxPrice: undefined,
			tags: undefined,
			location: undefined,
			radius: undefined,
			lat: undefined,
			lng: undefined,
			verified: undefined,
			orderable: undefined,
		};
		for (const key of Object.keys(attrParams)) reset[key] = undefined;
		router.setParams(reset);
	};

	// Typed text that names a category offers to browse it whole; once one is
	// chosen, the text would only narrow it again, so it is cleared.
	const suggestedCategories = params.category
		? []
		: matchCategories(categoriesData?.categories ?? [], query);
	const browseCategory = (id: string) => {
		remember(query);
		clearQuery();
		inputRef.current?.blur();
		router.setParams({ category: id });
	};
	const showRecent =
		inputFocused && query.trim().length === 0 && recent.length > 0;
	const canSave = !!(debouncedQuery || activeFilterCount > 0) && !!user;

	return (
		<SafeAreaView
			edges={["top"]}
			style={[styles.safe, { backgroundColor: c.background }]}
		>
			{/* ── Header: the title, then the query and its filters ── */}
			<View style={styles.header}>
				<Text
					style={[styles.pageTitle, { color: c.foreground }]}
					accessibilityRole="header"
				>
					{t("search.title")}
				</Text>
				<View style={styles.fieldRow}>
					<QueryField
						ref={inputRef}
						value={query}
						onChangeText={handleQueryChange}
						onSubmit={() => runSearch(query)}
						onClear={clearQuery}
						onFocus={() => setInputFocused(true)}
						onBlur={() => setInputFocused(false)}
						placeholder={t("home.searchPlaceholderDetailed")}
					/>
					<FiltersButton count={activeFilterCount} onPress={openFilters} />
				</View>
			</View>

			{/* ── Content area ── */}
			<View style={styles.content}>
				<SearchSegments
					active={segment}
					onChange={setSegment}
					listingsCount={totalDocs}
					shopsCount={shopTotal}
				/>

				{segment === "listings" && !showRecent && (
					<SortBar sort={sort} onChange={setSort} />
				)}

				{segment === "listings" && !showRecent && (
					<CategorySuggestions
						categories={suggestedCategories}
						onPick={browseCategory}
					/>
				)}

				{/* Results */}
				{showRecent ? (
					<RecentSearches
						recent={recent}
						onPick={runSearch}
						onRemove={remove}
						onClear={clear}
					/>
				) : segment === "shops" ? (
					<ShopResults params={shopParams} onClear={clearQuery} />
				) : isLoading ? (
					<View style={styles.skeleton}>
						<ListingGridSkeleton
							cardWidth={cardWidth}
							columns={columns}
							rows={3}
						/>
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
						{...(activeFilterCount > 0
							? { ctaLabel: t("search.clearFilters"), onCta: clearAll }
							: query
								? { ctaLabel: t("search.clearSearch"), onCta: clearQuery }
								: {})}
					/>
				) : (
					// Recycled rows keyed by their listings, so a page appended at
					// the end never re-renders the ones above it.
					<FlashList
						data={pairs}
						renderItem={renderRow}
						extraData={selectedId}
						keyExtractor={(row) => row.map((listing) => listing.id).join("|")}
						contentContainerStyle={{
							...styles.list,
							// The save button floats over the grid: the last row clears it.
							paddingBottom: canSave ? 96 : 32,
						}}
						keyboardDismissMode="on-drag"
						keyboardShouldPersistTaps="handled"
						refreshControl={
							<RefreshControl
								refreshing={refreshing}
								onRefresh={onRefresh}
								tintColor={c.primary}
								colors={[c.primaryFill]}
							/>
						}
						onEndReached={() =>
							hasNextPage && !isFetchingNextPage && fetchNextPage()
						}
						onEndReachedThreshold={0.5}
						ListFooterComponent={
							isFetchingNextPage ? (
								<ActivityIndicator color={c.primary} style={styles.more} />
							) : null
						}
						showsVerticalScrollIndicator={false}
					/>
				)}
			</View>

			{canSave && segment === "listings" && !showRecent && (
				<SaveSearchButton onPress={() => setSaveDialogOpen(true)} />
			)}

			<SaveSearchDialog
				visible={saveDialogOpen}
				onClose={() => setSaveDialogOpen(false)}
				query={debouncedQuery}
				searchParams={searchParams}
				filters={savedFilters}
			/>
		</SafeAreaView>
	);
}

const styles = StyleSheet.create({
	safe: { flex: 1 },
	header: {
		paddingHorizontal: 16,
		paddingTop: 8,
		paddingBottom: 12,
		gap: 12,
	},
	pageTitle: {
		fontSize: 30,
		lineHeight: 34,
		letterSpacing: -0.8,
		fontFamily: Fonts.displayExtrabold,
	},
	fieldRow: { flexDirection: "row", alignItems: "center", gap: 10 },
	content: { flex: 1 },
	list: { paddingHorizontal: 16, paddingTop: 12, gap: 16 },
	row: { flexDirection: "row", gap: 12 },
	skeleton: { padding: 16 },
	more: { margin: 16 },
});
