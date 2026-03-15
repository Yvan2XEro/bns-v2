import { Ionicons } from "@expo/vector-icons";
import { useQuery } from "@tanstack/react-query";
import { router } from "expo-router";
import React from "react";
import {
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
import { api } from "@/src/lib/api";
import { useAuth } from "@/src/lib/auth";

export default function FavoritesScreen() {
	const isDark = useColorScheme() === "dark";
	const { user } = useAuth();
	const bg = isDark ? "#0b1120" : "#f8fafc";
	const textColor = isDark ? "#e2e8f0" : "#0f172a";
	const borderColor = isDark ? "#1e3a5f" : "#e2e8f0";
	const primaryColor = isDark ? "#3b82f6" : "#1e40af";

	const { data, refetch } = useQuery({
		queryKey: ["favorites"],
		queryFn: () => api.get<{ docs: any[] }>("/api/favorites?depth=1&limit=100"),
		enabled: !!user,
	});

	const favorites = data?.docs ?? [];
	const pairs: any[][] = [];
	for (let i = 0; i < favorites.length; i += 2)
		pairs.push(favorites.slice(i, i + 2));

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
				<Text style={[styles.title, { color: textColor }]}>Favoris</Text>
				<View style={{ width: 40 }} />
			</View>

			{favorites.length === 0 ? (
				<EmptyState
					icon="heart-outline"
					title="Aucun favori"
					subtitle="Ajoutez des annonces à vos favoris pour les retrouver facilement"
					ctaLabel="Parcourir"
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
									isFavorite
									onToggleFavorite={() => {}}
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
	row: { flexDirection: "row", gap: 12, marginBottom: 12 },
});
