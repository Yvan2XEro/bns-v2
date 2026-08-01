import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import React from "react";
import {
	ActivityIndicator,
	FlatList,
	Pressable,
	RefreshControl,
	StyleSheet,
	Text,
	View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Fonts } from "@/constants/theme";
import { useColorScheme } from "@/hooks/use-color-scheme";
import { EmptyState } from "@/src/components/EmptyState";
import { ListingCard } from "@/src/components/ListingCard";
import { useFavoriteActions } from "@/src/hooks/useFavorites";
import { chunkIntoRows, useResponsive } from "@/src/hooks/useResponsive";
import { useTranslation } from "@/src/lib/i18n";

export default function FavoritesScreen() {
	const isDark = useColorScheme() === "dark";
	const { columns, cardWidth } = useResponsive();
	const { t } = useTranslation();
	const bg = isDark ? "#0b1120" : "#f8fafc";
	const textColor = isDark ? "#e2e8f0" : "#0f172a";
	const borderColor = isDark ? "#1e3a5f" : "#e2e8f0";
	const primaryColor = isDark ? "#3b82f6" : "#1e40af";

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
			style={[styles.safe, { backgroundColor: bg }]}
		>
			<View style={[styles.header, { borderBottomColor: borderColor }]}>
				<Pressable onPress={() => router.back()}>
					<Ionicons name="arrow-back" size={22} color={textColor} />
				</Pressable>
				<Text style={[styles.title, { color: textColor }]}>
					{t("favorites.title")}
				</Text>
				<View style={{ width: 40 }} />
			</View>

			{isLoading ? (
				// This screen previously showed "no favorites" on every cold load
				// and on any API failure.
				<View style={styles.loader}>
					<ActivityIndicator color={primaryColor} />
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
					contentContainerStyle={{ padding: 16 }}
					refreshControl={
						<RefreshControl
							refreshing={refreshing}
							onRefresh={onRefresh}
							tintColor={primaryColor}
						/>
					}
				/>
			)}
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
	title: { fontSize: 18, fontFamily: Fonts.displayBold },
	loader: { flex: 1, alignItems: "center", justifyContent: "center" },
	row: { flexDirection: "row", gap: 12, marginBottom: 12 },
});
