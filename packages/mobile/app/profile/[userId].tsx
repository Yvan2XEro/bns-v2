import { Ionicons } from "@expo/vector-icons";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Image } from "expo-image";
import { router, useLocalSearchParams } from "expo-router";
import { useState } from "react";
import {
	ActivityIndicator,
	Pressable,
	ScrollView,
	StyleSheet,
	Text,
	View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useColorScheme } from "@/hooks/use-color-scheme";
import { ListingCard } from "@/src/components/ListingCard";
import { ReviewStars } from "@/src/components/ReviewStars";
import { api } from "@/src/lib/api";
import { useAuth } from "@/src/lib/auth";

export default function PublicProfileScreen() {
	const { userId } = useLocalSearchParams<{ userId: string }>();
	const isDark = useColorScheme() === "dark";
	const { user } = useAuth();
	const _queryClient = useQueryClient();
	const [activeTab, setActiveTab] = useState<"listings" | "reviews">(
		"listings",
	);

	const bg = isDark ? "#0b1120" : "#f8fafc";
	const cardBg = isDark ? "#1e293b" : "#ffffff";
	const textColor = isDark ? "#e2e8f0" : "#0f172a";
	const mutedColor = isDark ? "#94a3b8" : "#64748b";
	const primaryColor = isDark ? "#3b82f6" : "#1e40af";
	const borderColor = isDark ? "#1e3a5f" : "#e2e8f0";
	const isOwnProfile = user?.id === userId;

	const { data: profileData, isLoading } = useQuery({
		queryKey: ["profile", userId],
		queryFn: () => api.get<any>(`/api/users/${userId}`),
		enabled: !!userId,
	});

	const { data: listingsData } = useQuery({
		queryKey: ["profile-listings", userId],
		queryFn: () =>
			api.get<{ docs: any[] }>(
				`/api/listings?where[seller][equals]=${userId}&where[_status][equals]=published&limit=20`,
			),
		enabled: !!userId,
	});

	const { data: reviewsData } = useQuery({
		queryKey: ["profile-reviews", userId],
		queryFn: () =>
			api.get<{ docs: any[] }>(
				`/api/reviews?where[reviewedUser][equals]=${userId}&limit=20`,
			),
		enabled: !!userId,
	});

	const profile = profileData?.doc ?? profileData;
	const listings = listingsData?.docs ?? [];
	const reviews = reviewsData?.docs ?? [];

	// 2-column grid pairs
	const pairs: any[][] = [];
	for (let i = 0; i < listings.length; i += 2)
		pairs.push(listings.slice(i, i + 2));

	if (isLoading) {
		return (
			<View style={[styles.loader, { backgroundColor: bg }]}>
				<ActivityIndicator color={primaryColor} />
			</View>
		);
	}

	return (
		<SafeAreaView
			edges={["top"]}
			style={[styles.safe, { backgroundColor: bg }]}
		>
			<View style={[styles.topBar, { borderBottomColor: borderColor }]}>
				<Pressable onPress={() => router.back()}>
					<Ionicons name="arrow-back" size={22} color={textColor} />
				</Pressable>
				<Text style={[styles.topTitle, { color: textColor }]}>Profil</Text>
				<View style={{ width: 40 }} />
			</View>

			<ScrollView showsVerticalScrollIndicator={false}>
				{/* Profile card */}
				<View
					style={[styles.profileCard, { backgroundColor: cardBg, borderColor }]}
				>
					{profile?.avatar?.url ? (
						<Image
							source={{ uri: profile.avatar.url }}
							style={styles.avatar}
							contentFit="cover"
						/>
					) : (
						<View
							style={[
								styles.avatarPlaceholder,
								{ backgroundColor: isDark ? "#1e3a5f" : "#dbeafe" },
							]}
						>
							<Text style={[styles.avatarLetter, { color: primaryColor }]}>
								{profile?.name?.[0]?.toUpperCase()}
							</Text>
						</View>
					)}

					<View style={styles.nameRow}>
						<Text style={[styles.name, { color: textColor }]}>
							{profile?.name}
						</Text>
						{profile?.verified && (
							<View
								style={[
									styles.verifiedBadge,
									{ backgroundColor: primaryColor },
								]}
							>
								<Text style={styles.verifiedText}>✓ Vérifié</Text>
							</View>
						)}
					</View>

					<ReviewStars
						rating={profile?.rating ?? 0}
						showCount
						count={profile?.totalReviews}
						size={16}
					/>

					<View style={styles.metaRow}>
						{profile?.location && (
							<View
								style={{ flexDirection: "row", alignItems: "center", gap: 4 }}
							>
								<Ionicons
									name="location-outline"
									size={13}
									color={mutedColor}
								/>
								<Text style={[styles.metaText, { color: mutedColor }]}>
									{profile.location}
								</Text>
							</View>
						)}
						{profile?.createdAt && (
							<Text style={[styles.metaText, { color: mutedColor }]}>
								Membre depuis{" "}
								{new Date(profile.createdAt).toLocaleDateString("fr-FR", {
									year: "numeric",
									month: "long",
								})}
							</Text>
						)}
					</View>

					{!isOwnProfile && (
						<View style={styles.actionRow}>
							<Pressable
								onPress={() =>
									user
										? router.push("/(tabs)/messages")
										: router.push("/auth/login")
								}
								style={[styles.msgBtn, { backgroundColor: primaryColor }]}
							>
								<Ionicons name="chatbubble" size={16} color="#fff" />
								<Text style={styles.msgBtnText}>Message</Text>
							</Pressable>
							<Pressable
								onPress={() =>
									router.push({
										pathname: "/report",
										params: { targetType: "user", targetId: userId },
									})
								}
								style={[
									styles.reportBtn,
									{ borderColor, backgroundColor: cardBg },
								]}
							>
								<Ionicons name="flag-outline" size={16} color={mutedColor} />
							</Pressable>
						</View>
					)}
				</View>

				{/* Tabs */}
				<View style={[styles.tabs, { borderBottomColor: borderColor }]}>
					{(["listings", "reviews"] as const).map((tab) => (
						<Pressable
							key={tab}
							onPress={() => setActiveTab(tab)}
							style={[
								styles.tab,
								activeTab === tab && {
									borderBottomColor: primaryColor,
									borderBottomWidth: 2,
								},
							]}
						>
							<Text
								style={[
									styles.tabText,
									{ color: activeTab === tab ? primaryColor : mutedColor },
								]}
							>
								{tab === "listings"
									? `Annonces (${listings.length})`
									: `Avis (${reviews.length})`}
							</Text>
						</Pressable>
					))}
				</View>

				{/* Listings tab */}
				{activeTab === "listings" && (
					<View style={styles.grid}>
						{pairs.map((pair, i) => (
							<View key={i} style={styles.gridRow}>
								{pair.map((listing: any) => (
									<ListingCard
										key={listing.id}
										listing={listing}
										isFavorite={false}
										onToggleFavorite={() => {}}
										onPress={(id) => router.push(`/listing/${id}`)}
									/>
								))}
							</View>
						))}
						{listings.length === 0 && (
							<Text style={[styles.emptyText, { color: mutedColor }]}>
								Aucune annonce
							</Text>
						)}
					</View>
				)}

				{/* Reviews tab */}
				{activeTab === "reviews" && (
					<View style={styles.reviewsList}>
						{reviews.map((review: any) => (
							<View
								key={review.id}
								style={[
									styles.reviewCard,
									{ backgroundColor: cardBg, borderColor },
								]}
							>
								<View style={styles.reviewHeader}>
									<View
										style={[
											styles.reviewerAvatar,
											{ backgroundColor: isDark ? "#1e3a5f" : "#dbeafe" },
										]}
									>
										<Text style={{ color: primaryColor, fontWeight: "700" }}>
											{review.reviewer?.name?.[0]?.toUpperCase()}
										</Text>
									</View>
									<View style={{ flex: 1 }}>
										<Text style={[styles.reviewerName, { color: textColor }]}>
											{review.reviewer?.name}
										</Text>
										<ReviewStars rating={review.rating} size={12} />
									</View>
									<Text style={[styles.reviewDate, { color: mutedColor }]}>
										{new Date(review.createdAt).toLocaleDateString("fr-FR")}
									</Text>
								</View>
								{review.comment && (
									<Text
										style={[
											styles.reviewComment,
											{ color: isDark ? "#cbd5e1" : "#334155" },
										]}
									>
										{review.comment}
									</Text>
								)}
							</View>
						))}
						{reviews.length === 0 && (
							<Text style={[styles.emptyText, { color: mutedColor }]}>
								Aucun avis
							</Text>
						)}
					</View>
				)}
			</ScrollView>
		</SafeAreaView>
	);
}

const styles = StyleSheet.create({
	safe: { flex: 1 },
	loader: { flex: 1, alignItems: "center", justifyContent: "center" },
	topBar: {
		flexDirection: "row",
		alignItems: "center",
		justifyContent: "space-between",
		paddingHorizontal: 16,
		paddingVertical: 12,
		borderBottomWidth: 1,
	},
	topTitle: { fontSize: 17, fontWeight: "700" },
	profileCard: {
		margin: 16,
		borderRadius: 16,
		borderWidth: 1,
		padding: 20,
		alignItems: "center",
		gap: 8,
	},
	avatar: { width: 88, height: 88, borderRadius: 44 },
	avatarPlaceholder: {
		width: 88,
		height: 88,
		borderRadius: 44,
		alignItems: "center",
		justifyContent: "center",
	},
	avatarLetter: { fontSize: 34, fontWeight: "700" },
	nameRow: { flexDirection: "row", alignItems: "center", gap: 8 },
	name: { fontSize: 20, fontWeight: "800" },
	verifiedBadge: { borderRadius: 12, paddingHorizontal: 8, paddingVertical: 3 },
	verifiedText: { color: "#fff", fontSize: 11, fontWeight: "700" },
	metaRow: { gap: 4, alignItems: "center" },
	metaText: { fontSize: 13 },
	actionRow: { flexDirection: "row", gap: 8, marginTop: 8 },
	msgBtn: {
		flex: 1,
		flexDirection: "row",
		alignItems: "center",
		justifyContent: "center",
		gap: 6,
		borderRadius: 12,
		paddingVertical: 11,
	},
	msgBtnText: { color: "#fff", fontWeight: "700", fontSize: 14 },
	reportBtn: {
		width: 44,
		height: 44,
		borderRadius: 12,
		borderWidth: 1,
		alignItems: "center",
		justifyContent: "center",
	},
	tabs: { flexDirection: "row", borderBottomWidth: 1 },
	tab: {
		flex: 1,
		paddingVertical: 12,
		alignItems: "center",
		borderBottomWidth: 2,
		borderBottomColor: "transparent",
	},
	tabText: { fontSize: 14, fontWeight: "600" },
	grid: { padding: 16 },
	gridRow: { flexDirection: "row", gap: 12, marginBottom: 12 },
	reviewsList: { padding: 16, gap: 10 },
	reviewCard: { borderRadius: 12, borderWidth: 1, padding: 14 },
	reviewHeader: {
		flexDirection: "row",
		alignItems: "center",
		gap: 10,
		marginBottom: 8,
	},
	reviewerAvatar: {
		width: 36,
		height: 36,
		borderRadius: 18,
		alignItems: "center",
		justifyContent: "center",
	},
	reviewerName: { fontSize: 14, fontWeight: "700" },
	reviewDate: { fontSize: 12 },
	reviewComment: { fontSize: 14, lineHeight: 20 },
	emptyText: { textAlign: "center", padding: 32, fontSize: 14 },
});
