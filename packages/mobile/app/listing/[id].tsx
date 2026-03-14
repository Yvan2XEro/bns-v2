import { Ionicons } from "@expo/vector-icons";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import * as Haptics from "expo-haptics";
import { Image } from "expo-image";
import { router, useLocalSearchParams } from "expo-router";
import { useState } from "react";
import {
	ActivityIndicator,
	Dimensions,
	Pressable,
	ScrollView,
	Share,
	StyleSheet,
	Text,
	View,
} from "react-native";
import { useColorScheme } from "@/hooks/use-color-scheme";
import { ListingCard } from "@/src/components/ListingCard";
import { PhoneReveal } from "@/src/components/PhoneReveal";
import { ReviewStars } from "@/src/components/ReviewStars";
import { StatusPill } from "@/src/components/StatusPill";
import { api } from "@/src/lib/api";
import { useAuth } from "@/src/lib/auth";

const { width } = Dimensions.get("window");

export default function ListingDetail() {
	const { id } = useLocalSearchParams<{ id: string }>();
	const isDark = useColorScheme() === "dark";
	const { user } = useAuth();
	const queryClient = useQueryClient();
	const [imageIndex, setImageIndex] = useState(0);
	const [descExpanded, setDescExpanded] = useState(false);

	const bg = isDark ? "#0b1120" : "#f8fafc";
	const cardBg = isDark ? "#1e293b" : "#ffffff";
	const textColor = isDark ? "#e2e8f0" : "#0f172a";
	const mutedColor = isDark ? "#94a3b8" : "#64748b";
	const primaryColor = isDark ? "#3b82f6" : "#1e40af";
	const borderColor = isDark ? "#1e3a5f" : "#e2e8f0";
	const amberColor = "#f59e0b";

	const { data: listingData, isLoading } = useQuery({
		queryKey: ["listing", id],
		queryFn: () => api.get<any>(`/api/listings/${id}?depth=2`),
		enabled: !!id,
	});

	const { data: favData } = useQuery({
		queryKey: ["favorite", id],
		queryFn: () =>
			api.get<{ docs: any[] }>(
				`/api/favorites?where[listing][equals]=${id}&limit=1`,
			),
		enabled: !!user && !!id,
	});

	const { data: similarData } = useQuery({
		queryKey: ["similar", id],
		queryFn: () => api.get<{ docs: any[] }>("/api/public/search?limit=6"),
		enabled: !!id,
	});

	const listing = listingData?.doc ?? listingData;
	const images = listing?.images ?? [];
	const seller = listing?.seller;
	const isOwner = user?.id === seller?.id;
	const favDoc = favData?.docs?.[0];
	const isFavorite = !!favDoc;

	const { mutate: toggleFav } = useMutation({
		mutationFn: () =>
			isFavorite
				? api.delete(`/api/favorites/${favDoc.id}`)
				: api.post("/api/favorites", { listing: id }),
		onMutate: async () => {
			Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
			await queryClient.cancelQueries({ queryKey: ["favorite", id] });
		},
		onSettled: () =>
			queryClient.invalidateQueries({ queryKey: ["favorite", id] }),
	});

	const handleShare = async () => {
		const url = `${process.env.EXPO_PUBLIC_API_URL?.replace("/api", "")}/listing/${id}`;
		Share.share({
			title: listing?.title,
			url,
			message: `${listing?.title} - ${listing?.price?.toLocaleString()} XAF`,
		});
	};

	const handleMessage = () => {
		if (!user) {
			router.push("/auth/login");
			return;
		}
		router.push({ pathname: "/(tabs)/messages", params: { listing: id } });
	};

	if (isLoading) {
		return (
			<View style={[styles.loader, { backgroundColor: bg }]}>
				<ActivityIndicator size="large" color={primaryColor} />
			</View>
		);
	}

	if (!listing) {
		return (
			<View style={[styles.loader, { backgroundColor: bg }]}>
				<Text style={{ color: textColor }}>Annonce introuvable</Text>
			</View>
		);
	}

	const timeAgo = (() => {
		const diff = Date.now() - new Date(listing.createdAt).getTime();
		const days = Math.floor(diff / 86400000);
		if (days === 0) return "Aujourd'hui";
		if (days === 1) return "Hier";
		return `Il y a ${days} jours`;
	})();

	return (
		<View style={[styles.root, { backgroundColor: bg }]}>
			<ScrollView
				showsVerticalScrollIndicator={false}
				stickyHeaderIndices={[0]}
			>
				{/* Back & actions header */}
				<View style={[styles.topBar, { backgroundColor: "transparent" }]}>
					<Pressable
						onPress={() => router.back()}
						style={[styles.topBtn, { backgroundColor: "rgba(0,0,0,0.4)" }]}
					>
						<Ionicons name="arrow-back" size={20} color="#fff" />
					</Pressable>
					<View style={styles.topRight}>
						<Pressable
							onPress={handleShare}
							style={[styles.topBtn, { backgroundColor: "rgba(0,0,0,0.4)" }]}
						>
							<Ionicons name="share-outline" size={20} color="#fff" />
						</Pressable>
						{!isOwner && (
							<Pressable
								onPress={() => toggleFav()}
								style={[styles.topBtn, { backgroundColor: "rgba(0,0,0,0.4)" }]}
							>
								<Ionicons
									name={isFavorite ? "heart" : "heart-outline"}
									size={20}
									color={isFavorite ? "#dc2626" : "#fff"}
								/>
							</Pressable>
						)}
					</View>
				</View>

				{/* Image Gallery */}
				<View style={styles.gallery}>
					<ScrollView
						horizontal
						pagingEnabled
						showsHorizontalScrollIndicator={false}
						onMomentumScrollEnd={(e) => {
							setImageIndex(Math.round(e.nativeEvent.contentOffset.x / width));
						}}
					>
						{images.length > 0 ? (
							images.map((img: any, i: number) => (
								<Image
									key={i}
									source={{ uri: img.url }}
									style={{ width, height: 300 }}
									contentFit="cover"
									placeholder={{ blurhash: "LGF5?xYk^6#M@-5c,1J5@[or[Q6." }}
								/>
							))
						) : (
							<View
								style={[
									styles.imagePlaceholder,
									{ backgroundColor: isDark ? "#1e293b" : "#e2e8f0" },
								]}
							>
								<Ionicons name="image-outline" size={60} color={mutedColor} />
							</View>
						)}
					</ScrollView>

					{/* Image indicators */}
					{images.length > 1 && (
						<View style={styles.indicators}>
							{images.map((_: any, i: number) => (
								<View
									key={i}
									style={[
										styles.dot,
										{
											backgroundColor:
												i === imageIndex ? "#fff" : "rgba(255,255,255,0.5)",
											width: i === imageIndex ? 16 : 6,
										},
									]}
								/>
							))}
						</View>
					)}

					{images.length > 1 && (
						<View
							style={[
								styles.photoCount,
								{ backgroundColor: "rgba(0,0,0,0.5)" },
							]}
						>
							<Text style={styles.photoCountText}>
								📷 {imageIndex + 1}/{images.length}
							</Text>
						</View>
					)}

					{listing.isBoosted && (
						<View style={styles.boostedBadge}>
							<Text style={styles.boostedText}>⭐ À la une</Text>
						</View>
					)}
				</View>

				{/* Content */}
				<View style={styles.content}>
					{/* Price & Title */}
					<View style={[styles.card, { backgroundColor: cardBg, borderColor }]}>
						<Text style={[styles.price, { color: primaryColor }]}>
							{listing.price?.toLocaleString() ?? "—"}{" "}
							<Text style={[styles.priceSuffix, { color: mutedColor }]}>
								XAF
							</Text>
						</Text>
						<Text style={[styles.title, { color: textColor }]}>
							{listing.title}
						</Text>
						<View style={styles.metaRow}>
							{listing.condition && <StatusPill status={listing.condition} />}
							{listing.isBoosted && <StatusPill status="boosted" />}
						</View>
						<View style={styles.metaRow2}>
							<Text style={[styles.metaItem, { color: mutedColor }]}>
								📍 {listing.location ?? "—"}
							</Text>
							<Text style={[styles.metaItem, { color: mutedColor }]}>
								🕐 {timeAgo}
							</Text>
							{listing.viewCount > 0 && (
								<Text style={[styles.metaItem, { color: mutedColor }]}>
									👁 {listing.viewCount}
								</Text>
							)}
						</View>
					</View>

					{/* Description */}
					<View style={[styles.card, { backgroundColor: cardBg, borderColor }]}>
						<Text style={[styles.sectionTitle, { color: textColor }]}>
							Description
						</Text>
						<Text
							style={[
								styles.description,
								{ color: isDark ? "#cbd5e1" : "#334155" },
							]}
							numberOfLines={descExpanded ? undefined : 4}
						>
							{listing.description}
						</Text>
						{listing.description?.length > 150 && (
							<Pressable onPress={() => setDescExpanded(!descExpanded)}>
								<Text style={[styles.readMore, { color: primaryColor }]}>
									{descExpanded ? "Réduire ▲" : "Lire plus ▼"}
								</Text>
							</Pressable>
						)}
					</View>

					{/* Attributes */}
					{listing.attributes && Object.keys(listing.attributes).length > 0 && (
						<View
							style={[styles.card, { backgroundColor: cardBg, borderColor }]}
						>
							<Text style={[styles.sectionTitle, { color: textColor }]}>
								Caractéristiques
							</Text>
							<View style={styles.attrsGrid}>
								{Object.entries(listing.attributes).map(([k, v]) => (
									<View
										key={k}
										style={[
											styles.attrItem,
											{
												backgroundColor: isDark ? "#0b1120" : "#f8fafc",
												borderColor,
											},
										]}
									>
										<Text style={[styles.attrKey, { color: mutedColor }]}>
											{k}
										</Text>
										<Text style={[styles.attrVal, { color: textColor }]}>
											{String(v)}
										</Text>
									</View>
								))}
							</View>
						</View>
					)}

					{/* Seller Card */}
					{seller && (
						<Pressable
							onPress={() => router.push(`/profile/${seller.id}`)}
							style={[styles.card, { backgroundColor: cardBg, borderColor }]}
						>
							<Text style={[styles.sectionTitle, { color: textColor }]}>
								Vendeur
							</Text>
							<View style={styles.sellerRow}>
								{seller.avatar?.url ? (
									<Image
										source={{ uri: seller.avatar.url }}
										style={styles.sellerAvatar}
										contentFit="cover"
									/>
								) : (
									<View
										style={[
											styles.sellerAvatarPlaceholder,
											{ backgroundColor: isDark ? "#1e3a5f" : "#dbeafe" },
										]}
									>
										<Text
											style={[styles.sellerLetter, { color: primaryColor }]}
										>
											{seller.name?.[0]?.toUpperCase()}
										</Text>
									</View>
								)}
								<View style={styles.sellerInfo}>
									<View
										style={{
											flexDirection: "row",
											alignItems: "center",
											gap: 6,
										}}
									>
										<Text style={[styles.sellerName, { color: textColor }]}>
											{seller.name}
										</Text>
										{seller.isVerified && (
											<View
												style={[
													styles.verifiedBadge,
													{ backgroundColor: primaryColor },
												]}
											>
												<Text style={styles.verifiedText}>✓</Text>
											</View>
										)}
									</View>
									<ReviewStars
										rating={seller.averageRating ?? 0}
										showCount
										count={seller.reviewCount}
									/>
									<Text style={[styles.memberSince, { color: mutedColor }]}>
										Membre depuis{" "}
										{new Date(seller.createdAt).toLocaleDateString("fr-FR", {
											year: "numeric",
											month: "long",
										})}
									</Text>
								</View>
								<Ionicons name="chevron-forward" size={16} color={mutedColor} />
							</View>
							{seller.phone && <PhoneReveal phone={seller.phone} />}
						</Pressable>
					)}

					{/* Safety Tips */}
					<View
						style={[
							styles.card,
							{
								backgroundColor: isDark ? "#162032" : "#fff7ed",
								borderColor: isDark ? "#1e3a5f" : "#fcd34d",
							},
						]}
					>
						<Text
							style={[
								styles.sectionTitle,
								{ color: isDark ? "#fcd34d" : "#92400e" },
							]}
						>
							🛡️ Conseils de sécurité
						</Text>
						{[
							"Rencontrez-vous dans un lieu public",
							"Vérifiez l'article avant de payer",
							"N'envoyez jamais d'argent à l'avance",
						].map((tip, i) => (
							<Text
								key={i}
								style={[
									styles.safetyTip,
									{ color: isDark ? "#fbbf24" : "#92400e" },
								]}
							>
								• {tip}
							</Text>
						))}
					</View>

					{/* Similar Listings */}
					{(similarData?.docs?.length ?? 0) > 0 && (
						<View style={{ marginBottom: 100 }}>
							<Text
								style={[
									styles.sectionTitle2,
									{ color: textColor, paddingHorizontal: 0 },
								]}
							>
								Annonces similaires
							</Text>
							<ScrollView
								horizontal
								showsHorizontalScrollIndicator={false}
								contentContainerStyle={{ gap: 12 }}
							>
								{(similarData?.docs ?? [])
									.filter((l: any) => l.id !== id)
									.slice(0, 5)
									.map((l: any) => (
										<ListingCard
											key={l.id}
											listing={l}
											width={180}
											isFavorite={false}
											onToggleFavorite={() => {}}
											onPress={(lid) => router.push(`/listing/${lid}`)}
										/>
									))}
							</ScrollView>
						</View>
					)}

					{/* Report link */}
					<Pressable
						onPress={() =>
							router.push({
								pathname: "/report",
								params: { targetType: "listing", targetId: id },
							})
						}
						style={styles.reportLink}
					>
						<Text style={[styles.reportText, { color: mutedColor }]}>
							🚩 Signaler cette annonce
						</Text>
					</Pressable>
				</View>
			</ScrollView>

			{/* Bottom Action Bar */}
			<View
				style={[
					styles.actionBar,
					{ backgroundColor: cardBg, borderTopColor: borderColor },
				]}
			>
				{!isOwner ? (
					<View style={styles.actionButtons}>
						<Pressable
							onPress={handleMessage}
							style={[styles.msgBtn, { backgroundColor: primaryColor }]}
						>
							<Ionicons name="chatbubble" size={18} color="#fff" />
							<Text style={styles.msgBtnText}>Contacter le vendeur</Text>
						</Pressable>
					</View>
				) : (
					<View style={styles.actionButtons}>
						{listing._status === "published" && !listing.isBoosted && (
							<Pressable
								onPress={() => router.push(`/boost/${id}`)}
								style={[styles.boostBtn, { backgroundColor: amberColor }]}
							>
								<Text style={styles.boostBtnText}>🚀 Booster</Text>
							</Pressable>
						)}
						<Pressable
							onPress={() => router.push(`/listing/${id}/edit`)}
							style={[
								styles.editBtn,
								{ backgroundColor: cardBg, borderColor, borderWidth: 1.5 },
							]}
						>
							<Ionicons name="pencil" size={16} color={primaryColor} />
							<Text style={[styles.editBtnText, { color: primaryColor }]}>
								Modifier
							</Text>
						</Pressable>
					</View>
				)}
			</View>
		</View>
	);
}

const styles = StyleSheet.create({
	root: { flex: 1 },
	loader: { flex: 1, alignItems: "center", justifyContent: "center" },
	topBar: {
		position: "absolute",
		top: 50,
		left: 0,
		right: 0,
		flexDirection: "row",
		justifyContent: "space-between",
		paddingHorizontal: 16,
		zIndex: 10,
	},
	topBtn: {
		width: 40,
		height: 40,
		borderRadius: 20,
		alignItems: "center",
		justifyContent: "center",
	},
	topRight: { flexDirection: "row", gap: 8 },
	gallery: { position: "relative" },
	imagePlaceholder: {
		width,
		height: 300,
		alignItems: "center",
		justifyContent: "center",
	},
	indicators: {
		position: "absolute",
		bottom: 12,
		left: 0,
		right: 0,
		flexDirection: "row",
		justifyContent: "center",
		gap: 4,
	},
	dot: { height: 6, borderRadius: 3, backgroundColor: "rgba(255,255,255,0.8)" },
	photoCount: {
		position: "absolute",
		bottom: 12,
		right: 12,
		borderRadius: 12,
		paddingHorizontal: 8,
		paddingVertical: 4,
	},
	photoCountText: { color: "#fff", fontSize: 12 },
	boostedBadge: {
		position: "absolute",
		top: 60,
		left: 12,
		backgroundColor: "#f59e0b",
		borderRadius: 8,
		paddingHorizontal: 10,
		paddingVertical: 4,
	},
	boostedText: { color: "#fff", fontSize: 12, fontWeight: "700" },
	content: { padding: 16, gap: 12 },
	card: { borderRadius: 14, borderWidth: 1, padding: 16 },
	price: { fontSize: 26, fontWeight: "800", marginBottom: 6 },
	priceSuffix: { fontSize: 16, fontWeight: "400" },
	title: { fontSize: 18, fontWeight: "600", marginBottom: 10, lineHeight: 24 },
	metaRow: { flexDirection: "row", gap: 8, marginBottom: 8 },
	metaRow2: { flexDirection: "row", gap: 12, flexWrap: "wrap" },
	metaItem: { fontSize: 13 },
	sectionTitle: { fontSize: 16, fontWeight: "700", marginBottom: 12 },
	sectionTitle2: { fontSize: 16, fontWeight: "700", marginBottom: 12 },
	description: { fontSize: 14, lineHeight: 22 },
	readMore: { marginTop: 8, fontSize: 14, fontWeight: "600" },
	attrsGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
	attrItem: {
		borderRadius: 8,
		borderWidth: 1,
		paddingHorizontal: 12,
		paddingVertical: 8,
		minWidth: "45%",
	},
	attrKey: { fontSize: 11, fontWeight: "600", marginBottom: 2 },
	attrVal: { fontSize: 14, fontWeight: "500" },
	sellerRow: {
		flexDirection: "row",
		alignItems: "center",
		gap: 12,
		marginBottom: 12,
	},
	sellerAvatar: { width: 56, height: 56, borderRadius: 28 },
	sellerAvatarPlaceholder: {
		width: 56,
		height: 56,
		borderRadius: 28,
		alignItems: "center",
		justifyContent: "center",
	},
	sellerLetter: { fontSize: 22, fontWeight: "700" },
	sellerInfo: { flex: 1, gap: 3 },
	sellerName: { fontSize: 16, fontWeight: "700" },
	verifiedBadge: { borderRadius: 10, paddingHorizontal: 6, paddingVertical: 2 },
	verifiedText: { color: "#fff", fontSize: 11, fontWeight: "700" },
	memberSince: { fontSize: 12 },
	safetyTip: { fontSize: 13, lineHeight: 20, marginBottom: 4 },
	reportLink: { alignItems: "center", padding: 8, marginBottom: 16 },
	reportText: { fontSize: 13 },
	actionBar: {
		position: "absolute",
		bottom: 0,
		left: 0,
		right: 0,
		borderTopWidth: 1,
		padding: 16,
		paddingBottom: 24,
	},
	actionButtons: { flexDirection: "row", gap: 10 },
	msgBtn: {
		flex: 1,
		flexDirection: "row",
		alignItems: "center",
		justifyContent: "center",
		gap: 8,
		borderRadius: 14,
		paddingVertical: 14,
	},
	msgBtnText: { color: "#fff", fontSize: 16, fontWeight: "700" },
	boostBtn: {
		flex: 1,
		alignItems: "center",
		justifyContent: "center",
		borderRadius: 14,
		paddingVertical: 14,
	},
	boostBtnText: { color: "#fff", fontSize: 16, fontWeight: "700" },
	editBtn: {
		flex: 1,
		flexDirection: "row",
		alignItems: "center",
		justifyContent: "center",
		gap: 6,
		borderRadius: 14,
		paddingVertical: 14,
	},
	editBtnText: { fontSize: 15, fontWeight: "700" },
});
