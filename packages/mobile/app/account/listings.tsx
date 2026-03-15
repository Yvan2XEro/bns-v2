import { Ionicons } from "@expo/vector-icons";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Image } from "expo-image";
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
import { StatusPill } from "@/src/components/StatusPill";
import { useAlert } from "@/src/contexts/AlertContext";
import { api } from "@/src/lib/api";
import { useAuth } from "@/src/lib/auth";
import { resolveListingImageUrl } from "@/src/lib/resolveImageUrl";

export default function MyListingsScreen() {
	const isDark = useColorScheme() === "dark";
	const { user } = useAuth();
	const queryClient = useQueryClient();
	const { showConfirm } = useAlert();

	const bg = isDark ? "#0b1120" : "#f8fafc";
	const cardBg = isDark ? "#1e293b" : "#ffffff";
	const textColor = isDark ? "#e2e8f0" : "#0f172a";
	const mutedColor = isDark ? "#94a3b8" : "#64748b";
	const primaryColor = isDark ? "#3b82f6" : "#1e40af";
	const borderColor = isDark ? "#1e3a5f" : "#e2e8f0";

	const { data, isLoading, refetch } = useQuery({
		queryKey: ["my-listings"],
		queryFn: () =>
			api.get<{ docs: any[]; totalDocs: number }>(
				`/api/listings?where[seller][equals]=${user?.id}&limit=50&sort=-createdAt&depth=1`,
			),
		enabled: !!user,
	});

	const listings = data?.docs ?? [];

	const stats = {
		total: listings.length,
		active: listings.filter((l: any) => l._status === "published").length,
		pending: listings.filter(
			(l: any) => l._status === "pending" || l._status === "review",
		).length,
		sold: listings.filter((l: any) => l._status === "sold").length,
		expired: listings.filter((l: any) => l._status === "expired").length,
		boosted: listings.filter((l: any) => l.isBoosted).length,
	};

	const { mutate: markSold } = useMutation({
		mutationFn: (id: string) =>
			api.patch(`/api/listings/${id}`, { _status: "sold" }),
		onSuccess: () =>
			queryClient.invalidateQueries({ queryKey: ["my-listings"] }),
	});

	const { mutate: deleteListing } = useMutation({
		mutationFn: (id: string) => api.delete(`/api/listings/${id}`),
		onSuccess: () =>
			queryClient.invalidateQueries({ queryKey: ["my-listings"] }),
	});

	const [refreshing, setRefreshing] = React.useState(false);
	const onRefresh = async () => {
		setRefreshing(true);
		await refetch();
		setRefreshing(false);
	};

	const STATS = [
		{ key: "total", label: "Total", color: primaryColor },
		{ key: "active", label: "Actif", color: "#16a34a" },
		{ key: "pending", label: "En attente", color: "#2563eb" },
		{ key: "sold", label: "Vendu", color: "#64748b" },
		{ key: "expired", label: "Expiré", color: "#ea580c" },
		{ key: "boosted", label: "Boosté", color: "#f59e0b" },
	] as const;

	return (
		<SafeAreaView
			edges={["top"]}
			style={[styles.safe, { backgroundColor: bg }]}
		>
			{/* Header */}
			<View style={[styles.header, { borderBottomColor: borderColor }]}>
				<Pressable onPress={() => router.back()} style={styles.backBtn}>
					<Ionicons name="arrow-back" size={22} color={textColor} />
				</Pressable>
				<Text style={[styles.headerTitle, { color: textColor }]}>
					Mes annonces
				</Text>
				<Pressable
					onPress={() => router.push("/(tabs)/create")}
					style={styles.addBtn}
				>
					<Ionicons name="add" size={24} color={primaryColor} />
				</Pressable>
			</View>

			{isLoading ? (
				<ActivityIndicator style={{ margin: 32 }} color={primaryColor} />
			) : (
				<FlatList
					data={listings}
					keyExtractor={(item) => item.id}
					refreshControl={
						<RefreshControl
							refreshing={refreshing}
							onRefresh={onRefresh}
							tintColor={primaryColor}
						/>
					}
					ListHeaderComponent={
						<View style={styles.statsRow}>
							{STATS.map(({ key, label, color }) => (
								<View
									key={key}
									style={[
										styles.statCard,
										{ backgroundColor: cardBg, borderColor },
									]}
								>
									<Text style={[styles.statNum, { color }]}>{stats[key]}</Text>
									<Text style={[styles.statLabel, { color: mutedColor }]}>
										{label}
									</Text>
								</View>
							))}
						</View>
					}
					ListEmptyComponent={
						<EmptyState
							icon="cube-outline"
							title="Aucune annonce"
							subtitle="Publiez votre première annonce !"
							ctaLabel="Créer une annonce"
							onCta={() => router.push("/(tabs)/create")}
						/>
					}
					renderItem={({ item }) => (
						<Pressable
							onPress={() => router.push(`/listing/${item.id}`)}
							style={[
								styles.listingRow,
								{ backgroundColor: cardBg, borderColor },
							]}
						>
							{resolveListingImageUrl(item.images?.[0]) ? (
								<Image
									source={{ uri: resolveListingImageUrl(item.images?.[0])! }}
									style={styles.thumbnail}
									contentFit="cover"
								/>
							) : (
								<View
									style={[
										styles.thumbnailPlaceholder,
										{ backgroundColor: isDark ? "#162032" : "#e2e8f0" },
									]}
								>
									<Ionicons name="image-outline" size={20} color={mutedColor} />
								</View>
							)}
							<View style={styles.listingInfo}>
								<Text
									style={[styles.listingTitle, { color: textColor }]}
									numberOfLines={2}
								>
									{item.title}
								</Text>
								<Text style={[styles.listingPrice, { color: primaryColor }]}>
									{item.price?.toLocaleString()} XAF
								</Text>
								<StatusPill status={item._status ?? "pending"} />
							</View>
							<View style={styles.actions}>
								<Pressable
									onPress={() => router.push(`/listing/${item.id}/edit`)}
									style={[
										styles.actionBtn,
										{ backgroundColor: isDark ? "#162032" : "#f1f5f9" },
									]}
								>
									<Ionicons name="pencil" size={14} color={primaryColor} />
								</Pressable>
								<Pressable
									onPress={() =>
										showConfirm("Supprimer", "Supprimer cette annonce ?", () =>
											deleteListing(item.id),
										)
									}
									style={[
										styles.actionBtn,
										{ backgroundColor: isDark ? "#162032" : "#fee2e2" },
									]}
								>
									<Ionicons name="trash" size={14} color="#dc2626" />
								</Pressable>
							</View>
						</Pressable>
					)}
					contentContainerStyle={{ padding: 16, gap: 10 }}
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
		paddingHorizontal: 16,
		paddingVertical: 12,
		borderBottomWidth: 1,
	},
	backBtn: {
		width: 40,
		height: 40,
		alignItems: "center",
		justifyContent: "center",
	},
	headerTitle: {
		flex: 1,
		fontSize: 18,
		fontFamily: Fonts.displayBold,
		textAlign: "center",
	},
	addBtn: {
		width: 40,
		height: 40,
		alignItems: "center",
		justifyContent: "center",
	},
	statsRow: {
		flexDirection: "row",
		flexWrap: "wrap",
		gap: 8,
		marginBottom: 12,
	},
	statCard: {
		borderRadius: 10,
		borderWidth: 1,
		padding: 10,
		minWidth: "30%",
		flex: 1,
		alignItems: "center",
	},
	statNum: { fontSize: 22, fontFamily: Fonts.displayExtrabold },
	statLabel: { fontSize: 11, fontFamily: Fonts.bodySemibold, marginTop: 2 },
	listingRow: {
		flexDirection: "row",
		alignItems: "center",
		borderRadius: 12,
		borderWidth: 1,
		padding: 10,
		gap: 12,
	},
	thumbnail: { width: 70, height: 70, borderRadius: 8 },
	thumbnailPlaceholder: {
		width: 70,
		height: 70,
		borderRadius: 8,
		alignItems: "center",
		justifyContent: "center",
	},
	listingInfo: { flex: 1, gap: 4 },
	listingTitle: { fontSize: 14, fontFamily: Fonts.bodyMedium, lineHeight: 18 },
	listingPrice: { fontSize: 14, fontFamily: Fonts.displayBold },
	actions: { gap: 6 },
	actionBtn: {
		width: 32,
		height: 32,
		borderRadius: 8,
		alignItems: "center",
		justifyContent: "center",
	},
});
