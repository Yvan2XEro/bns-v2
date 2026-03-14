import { Ionicons } from "@expo/vector-icons";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Image } from "expo-image";
import { router } from "expo-router";
import React from "react";
import {
	Dimensions,
	Pressable,
	RefreshControl,
	ScrollView,
	StyleSheet,
	Text,
	View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useColorScheme } from "@/hooks/use-color-scheme";
import { CategoryIcon } from "@/src/components/CategoryIcon";
import { EmptyState } from "@/src/components/EmptyState";
import { ListingCard } from "@/src/components/ListingCard";
import { api } from "@/src/lib/api";
import { useAuth } from "@/src/lib/auth";

const { width } = Dimensions.get("window");

export default function HomeScreen() {
	const isDark = useColorScheme() === "dark";
	const { user } = useAuth();
	const queryClient = useQueryClient();

	const { data: categoriesData } = useQuery({
		queryKey: ["categories"],
		queryFn: () => api.get<{ docs: any[] }>("/api/public/categories?depth=1"),
		staleTime: 60 * 60 * 1000,
	});

	const {
		data: recentData,
		isLoading: recentLoading,
		refetch,
	} = useQuery({
		queryKey: ["listings", "recent"],
		queryFn: () =>
			api.get<{ docs: any[] }>("/api/public/search?limit=20&sort=-createdAt"),
	});

	const { data: favData } = useQuery({
		queryKey: ["favorites"],
		queryFn: () => api.get<{ docs: any[] }>("/api/favorites?limit=200"),
		enabled: !!user,
	});

	const categories = categoriesData?.docs?.slice(0, 8) ?? [];
	const listings = recentData?.docs ?? [];
	const boostedListings = listings.filter((l: any) => l.isBoosted);
	const favoriteIds = new Set(
		(favData?.docs ?? []).map((f: any) => f.listing?.id ?? f.listing),
	);

	const [refreshing, setRefreshing] = React.useState(false);
	const onRefresh = async () => {
		setRefreshing(true);
		await queryClient.invalidateQueries({ queryKey: ["listings"] });
		await queryClient.invalidateQueries({ queryKey: ["favorites"] });
		setRefreshing(false);
	};

	const bg = isDark ? "#0b1120" : "#f8fafc";
	const cardBg = isDark ? "#1e293b" : "#ffffff";
	const textColor = isDark ? "#e2e8f0" : "#0f172a";
	const mutedColor = isDark ? "#94a3b8" : "#64748b";
	const primaryColor = isDark ? "#3b82f6" : "#1e40af";

	return (
		<SafeAreaView style={[styles.safe, { backgroundColor: bg }]}>
			<ScrollView
				showsVerticalScrollIndicator={false}
				refreshControl={
					<RefreshControl
						refreshing={refreshing}
						onRefresh={onRefresh}
						tintColor={primaryColor}
					/>
				}
			>
				{/* Header */}
				<View style={styles.header}>
					<View>
						<Text style={[styles.greeting, { color: mutedColor }]}>
							{user
								? `Bonjour, ${user.name?.split(" ")[0]} 👋`
								: "Bienvenue sur"}
						</Text>
						<Text style={[styles.appName, { color: primaryColor }]}>
							Buy'N'Sellem
						</Text>
					</View>
					<View style={styles.headerActions}>
						<Pressable
							onPress={() => router.push("/(tabs)/account")}
							style={[
								styles.avatarBtn,
								{
									backgroundColor: cardBg,
									borderColor: isDark ? "#1e3a5f" : "#e2e8f0",
								},
							]}
						>
							{user?.avatar?.url ? (
								<Image
									source={{ uri: user.avatar.url }}
									style={styles.avatar}
									contentFit="cover"
								/>
							) : (
								<Ionicons name="person" size={20} color={mutedColor} />
							)}
						</Pressable>
					</View>
				</View>

				{/* Search Bar (tappable, goes to search tab) */}
				<Pressable
					onPress={() => router.push("/(tabs)/search")}
					style={[
						styles.searchBar,
						{
							backgroundColor: cardBg,
							borderColor: isDark ? "#1e3a5f" : "#e2e8f0",
						},
					]}
				>
					<Ionicons name="search" size={18} color={mutedColor} />
					<Text style={[styles.searchPlaceholder, { color: mutedColor }]}>
						Voitures, téléphones, maisons...
					</Text>
				</Pressable>

				{/* Categories */}
				{categories.length > 0 && (
					<View style={styles.section}>
						<View style={styles.sectionHeader}>
							<Text style={[styles.sectionTitle, { color: textColor }]}>
								Catégories
							</Text>
							<Pressable onPress={() => router.push("/(tabs)/search")}>
								<Text style={[styles.seeAll, { color: primaryColor }]}>
									Voir tout →
								</Text>
							</Pressable>
						</View>
						<ScrollView
							horizontal
							showsHorizontalScrollIndicator={false}
							contentContainerStyle={{ paddingHorizontal: 16, gap: 8 }}
						>
							{categories.map((cat: any) => (
								<CategoryIcon
									key={cat.id}
									category={cat}
									onPress={(id: string) =>
										router.push({
											pathname: "/(tabs)/search",
											params: { category: id },
										})
									}
								/>
							))}
						</ScrollView>
					</View>
				)}

				{/* Featured Listings */}
				{boostedListings.length > 0 && (
					<View style={styles.section}>
						<View style={styles.sectionHeader}>
							<Text style={[styles.sectionTitle, { color: textColor }]}>
								⭐ À la une
							</Text>
						</View>
						<ScrollView
							horizontal
							showsHorizontalScrollIndicator={false}
							pagingEnabled
							contentContainerStyle={{ paddingHorizontal: 16, gap: 12 }}
						>
							{boostedListings.slice(0, 6).map((listing: any) => (
								<Pressable
									key={listing.id}
									onPress={() => router.push(`/listing/${listing.id}`)}
									style={[
										styles.featuredCard,
										{ backgroundColor: cardBg, width: width - 64 },
									]}
								>
									<Image
										source={{ uri: listing.images?.[0]?.url }}
										style={styles.featuredImage}
										contentFit="cover"
										placeholder={{ blurhash: "LGF5?xYk^6#M@-5c,1J5@[or[Q6." }}
									/>
									<View style={styles.featuredOverlay}>
										<View style={styles.featuredBadge}>
											<Text style={styles.featuredBadgeText}>⭐ À la une</Text>
										</View>
										<View style={styles.featuredInfo}>
											<Text style={styles.featuredPrice}>
												{listing.price?.toLocaleString()} XAF
											</Text>
											<Text style={styles.featuredTitle} numberOfLines={1}>
												{listing.title}
											</Text>
											<Text style={styles.featuredMeta}>
												📍 {listing.location}
											</Text>
										</View>
									</View>
								</Pressable>
							))}
						</ScrollView>
					</View>
				)}

				{/* Recent Listings */}
				<View style={styles.section}>
					<View style={styles.sectionHeader}>
						<Text style={[styles.sectionTitle, { color: textColor }]}>
							Annonces récentes
						</Text>
						<Pressable onPress={() => router.push("/(tabs)/search")}>
							<Text style={[styles.seeAll, { color: primaryColor }]}>
								Voir tout →
							</Text>
						</Pressable>
					</View>

					{listings.length === 0 && !recentLoading ? (
						<EmptyState
							emoji="🏪"
							title="Aucune annonce"
							subtitle="Soyez le premier à publier une annonce !"
							ctaLabel="Publier"
							onCta={() => router.push("/(tabs)/create")}
						/>
					) : (
						<View style={styles.grid}>
							{listings.map((listing: any) => (
								<ListingCard
									key={listing.id}
									listing={listing}
									isFavorite={favoriteIds.has(listing.id)}
									onToggleFavorite={() => {}}
									onPress={(id: string) => router.push(`/listing/${id}`)}
								/>
							))}
						</View>
					)}
				</View>
			</ScrollView>
		</SafeAreaView>
	);
}

const styles = StyleSheet.create({
	safe: { flex: 1 },
	header: {
		flexDirection: "row",
		justifyContent: "space-between",
		alignItems: "center",
		paddingHorizontal: 16,
		paddingTop: 8,
		paddingBottom: 12,
	},
	greeting: { fontSize: 13 },
	appName: { fontSize: 22, fontWeight: "800" },
	headerActions: { flexDirection: "row", gap: 8 },
	avatarBtn: {
		width: 40,
		height: 40,
		borderRadius: 20,
		alignItems: "center",
		justifyContent: "center",
		borderWidth: 1,
		overflow: "hidden",
	},
	avatar: { width: 40, height: 40, borderRadius: 20 },
	searchBar: {
		flexDirection: "row",
		alignItems: "center",
		gap: 10,
		marginHorizontal: 16,
		borderRadius: 14,
		borderWidth: 1,
		paddingHorizontal: 14,
		paddingVertical: 12,
		marginBottom: 8,
	},
	searchPlaceholder: { fontSize: 15, flex: 1 },
	section: { marginTop: 16 },
	sectionHeader: {
		flexDirection: "row",
		justifyContent: "space-between",
		alignItems: "center",
		paddingHorizontal: 16,
		marginBottom: 12,
	},
	sectionTitle: { fontSize: 17, fontWeight: "700" },
	seeAll: { fontSize: 13, fontWeight: "600" },
	featuredCard: { borderRadius: 16, overflow: "hidden" },
	featuredImage: { width: "100%", height: 200 },
	featuredOverlay: {
		position: "absolute",
		bottom: 0,
		left: 0,
		right: 0,
		padding: 12,
		backgroundColor: "rgba(0,0,0,0.45)",
	},
	featuredBadge: {
		backgroundColor: "#f59e0b",
		alignSelf: "flex-start",
		borderRadius: 6,
		paddingHorizontal: 8,
		paddingVertical: 3,
		marginBottom: 6,
	},
	featuredBadgeText: { color: "#fff", fontSize: 11, fontWeight: "700" },
	featuredInfo: {},
	featuredPrice: { color: "#fff", fontSize: 18, fontWeight: "800" },
	featuredTitle: { color: "#fff", fontSize: 14 },
	featuredMeta: { color: "rgba(255,255,255,0.8)", fontSize: 12 },
	grid: {
		flexDirection: "row",
		flexWrap: "wrap",
		paddingHorizontal: 16,
		gap: 12,
		paddingBottom: 20,
	},
});
