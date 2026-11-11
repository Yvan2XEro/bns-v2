import { router } from "expo-router";
import React from "react";
import { FlatList, RefreshControl, StyleSheet, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { EmptyState } from "@/src/components/EmptyState";
import { ListingCard } from "@/src/components/ListingCard";
import { ListingGridSkeleton } from "@/src/components/listing/Skeletons";
import { useGroupedColors } from "@/src/components/settings/Grouped";
import { SettingsHeader } from "@/src/components/settings/SettingsHeader";
import { useFavoriteActions } from "@/src/hooks/useFavorites";
import { chunkIntoRows, useResponsive } from "@/src/hooks/useResponsive";
import { useTranslation } from "@/src/lib/i18n";

export function FavoritesScreen() {
	const c = useGroupedColors();
	const { columns, cardWidth } = useResponsive();
	const { t } = useTranslation();

	const { favorites, isLoading, isError, refetch, toggleFavorite } =
		useFavoriteActions();
	const pairs = chunkIntoRows(favorites, columns);

	const [refreshing, setRefreshing] = React.useState(false);
	const onRefresh = async () => {
		setRefreshing(true);
		await refetch();
		setRefreshing(false);
	};

	return (
		<SafeAreaView
			edges={["top"]}
			style={[styles.safe, { backgroundColor: c.background }]}
		>
			<SettingsHeader title={t("favorites.title")} />

			{isLoading ? (
				// This screen previously showed "no favorites" on every cold load
				// and on any API failure.
				<View
					style={styles.list}
					accessible
					accessibilityRole="progressbar"
					accessibilityLabel={t("common.loading")}
				>
					<ListingGridSkeleton
						cardWidth={cardWidth}
						columns={columns}
						rows={3}
					/>
				</View>
			) : isError ? (
				<EmptyState
					icon="alert-circle-outline"
					title={t("common.error")}
					subtitle={t("home.errorSub")}
					ctaLabel={t("common.retry")}
					onCta={() => refetch()}
				/>
			) : favorites.length === 0 ? (
				<EmptyState
					icon="heart-outline"
					title={t("favorites.noFavorites")}
					subtitle={t("favorites.noFavoritesSub")}
					ctaLabel={t("favorites.browse")}
					onCta={() => router.push("/(tabs)/search")}
				/>
			) : (
				<FlatList
					data={pairs}
					renderItem={({ item }) => (
						<View style={styles.row}>
							{item.map((fav: any) => (
								<ListingCard
									key={fav.id}
									listing={fav.listing ?? fav}
									width={cardWidth}
									isFavorite
									onToggleFavorite={() => toggleFavorite(fav.listing ?? fav)}
									onPress={(id) => router.push(`/listing/${id}`)}
								/>
							))}
						</View>
					)}
					keyExtractor={(_, i) => String(i)}
					contentContainerStyle={styles.list}
					refreshControl={
						<RefreshControl
							refreshing={refreshing}
							onRefresh={onRefresh}
							tintColor={c.primary}
							colors={[c.primary]}
						/>
					}
				/>
			)}
		</SafeAreaView>
	);
}

const styles = StyleSheet.create({
	safe: { flex: 1 },
	list: { padding: 16 },
	row: { flexDirection: "row", gap: 12, marginBottom: 16 },
});
