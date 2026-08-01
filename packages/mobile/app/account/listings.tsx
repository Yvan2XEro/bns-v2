import { Ionicons } from "@expo/vector-icons";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Image } from "expo-image";
import { router } from "expo-router";
import React, { useMemo, useState } from "react";
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
import { AnimatedPressable } from "@/src/components/AnimatedPressable";
import { EmptyState } from "@/src/components/EmptyState";
import { useAlert } from "@/src/contexts/AlertContext";
import { useResponsive } from "@/src/hooks/useResponsive";
import { api } from "@/src/lib/api";
import { useAuth } from "@/src/lib/auth";
import { useTranslation } from "@/src/lib/i18n";
import { resolveListingImageUrl } from "@/src/lib/resolveImageUrl";

type FilterKey = "all" | "published" | "pending" | "sold" | "expired";

function getStatusConfig(t: (key: string) => string) {
	return {
		published: {
			label: t("listings.statusPublished"),
			bg: "#dcfce7",
			text: "#166534",
			dotColor: "#22c55e",
		},
		pending: {
			label: t("listings.statusPending"),
			bg: "#dbeafe",
			text: "#1e40af",
			dotColor: "#3b82f6",
		},
		review: {
			label: t("listings.statusReview"),
			bg: "#dbeafe",
			text: "#1e40af",
			dotColor: "#3b82f6",
		},
		rejected: {
			label: t("listings.statusRejected"),
			bg: "#fee2e2",
			text: "#991b1b",
			dotColor: "#ef4444",
		},
		sold: {
			label: t("listings.statusSold"),
			bg: "#f3f4f6",
			text: "#374151",
			dotColor: "#94a3b8",
		},
		expired: {
			label: t("listings.statusExpired"),
			bg: "#fff7ed",
			text: "#9a3412",
			dotColor: "#f97316",
		},
	} as Record<
		string,
		{ label: string; bg: string; text: string; dotColor: string }
	>;
}

function StatusBadge({
	status,
	t,
}: {
	status: string;
	t: (key: string) => string;
}) {
	const cfg = getStatusConfig(t)[status] ?? {
		label: status,
		bg: "#f3f4f6",
		text: "#374151",
		dotColor: "#94a3b8",
	};
	return (
		<View style={[styles.statusBadge, { backgroundColor: cfg.bg }]}>
			<View style={[styles.statusDot, { backgroundColor: cfg.dotColor }]} />
			<Text style={[styles.statusText, { color: cfg.text }]}>{cfg.label}</Text>
		</View>
	);
}

function formatDate(dateStr: string) {
	return new Date(dateStr).toLocaleDateString("fr-FR", {
		day: "2-digit",
		month: "short",
		year: "numeric",
	});
}

export default function MyListingsScreen() {
	const isDark = useColorScheme() === "dark";
	const { centeredContent } = useResponsive();
	const { user } = useAuth();
	const queryClient = useQueryClient();
	const { showConfirm } = useAlert();
	const { t } = useTranslation();
	const [activeFilter, setActiveFilter] = useState<FilterKey>("all");

	const bg = isDark ? "#0b1120" : "#f8fafc";
	const cardBg = isDark ? "#1e293b" : "#ffffff";
	const textColor = isDark ? "#e2e8f0" : "#0f172a";
	const mutedColor = isDark ? "#94a3b8" : "#64748b";
	const primaryColor = isDark ? "#3b82f6" : "#1e40af";
	const borderColor = isDark ? "#1e3a5f" : "#e2e8f0";

	const FILTERS: { key: FilterKey; label: string }[] = [
		{ key: "all", label: t("listings.filterAll") },
		{ key: "published", label: t("listings.filterPublished") },
		{ key: "pending", label: t("listings.filterPending") },
		{ key: "sold", label: t("listings.filterSold") },
		{ key: "expired", label: t("listings.filterExpired") },
	];

	const { data, isLoading, refetch } = useQuery({
		queryKey: ["my-listings"],
		queryFn: () =>
			api.get<{ docs: any[]; totalDocs: number }>(
				`/api/listings?where[seller][equals]=${user?.id}&limit=50&sort=-createdAt&depth=1&draft=true`,
			),
		enabled: !!user,
	});

	const listings = data?.docs ?? [];

	const stats = useMemo(
		() => ({
			total: listings.length,
			published: listings.filter((l: any) => l.status === "published").length,
			pending: listings.filter(
				(l: any) =>
					l.status === "pending" ||
					l.status === "review" ||
					l.status === "draft",
			).length,
			sold: listings.filter((l: any) => l.status === "sold").length,
			expired: listings.filter((l: any) => l.status === "expired").length,
		}),
		[listings],
	);

	const filtered = useMemo(() => {
		if (activeFilter === "all") return listings;
		if (activeFilter === "pending")
			return listings.filter(
				(l: any) =>
					l.status === "pending" ||
					l.status === "review" ||
					l.status === "draft",
			);
		return listings.filter((l: any) => l.status === activeFilter);
	}, [listings, activeFilter]);

	const { mutate: markSold } = useMutation({
		mutationFn: (id: string) =>
			api.patch(`/api/listings/${id}`, { status: "sold" }),
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

	const STAT_ITEMS = [
		{
			key: "total" as const,
			label: t("listings.total"),
			color: primaryColor,
			icon: "layers-outline" as const,
		},
		{
			key: "published" as const,
			label: t("listings.published"),
			color: "#22c55e",
			icon: "checkmark-circle-outline" as const,
		},
		{
			key: "pending" as const,
			label: t("listings.pending"),
			color: "#3b82f6",
			icon: "time-outline" as const,
		},
		{
			key: "sold" as const,
			label: t("listings.sold"),
			color: "#94a3b8",
			icon: "bag-check-outline" as const,
		},
	];

	const renderItem = ({ item }: { item: any }) => {
		const imgUrl = resolveListingImageUrl(item.images?.[0]);
		const isBoosted = !!(
			item.boostedUntil && new Date(item.boostedUntil) > new Date()
		);

		return (
			<AnimatedPressable
				onPress={() => router.push(`/listing/${item.id}`)}
				scaleTo={0.985}
				style={[styles.card, { backgroundColor: cardBg, borderColor }]}
			>
				{/* Image */}
				<View style={styles.imageWrap}>
					{imgUrl ? (
						<Image
							source={{ uri: imgUrl }}
							style={styles.image}
							contentFit="cover"
						/>
					) : (
						<View
							style={[
								styles.imagePlaceholder,
								{ backgroundColor: isDark ? "#162032" : "#e2e8f0" },
							]}
						>
							<Ionicons name="image-outline" size={24} color={mutedColor} />
						</View>
					)}
					{isBoosted && (
						<View style={styles.boostBadge}>
							<Ionicons name="flash" size={10} color="#fff" />
						</View>
					)}
				</View>

				{/* Info */}
				<View style={styles.info}>
					<Text style={[styles.title, { color: textColor }]} numberOfLines={2}>
						{item.title}
					</Text>
					<Text style={[styles.price, { color: primaryColor }]}>
						{item.price?.toLocaleString()} XAF
					</Text>
					<View style={styles.metaRow}>
						<StatusBadge status={item.status ?? "pending"} t={t} />
						{item.createdAt && (
							<Text style={[styles.date, { color: mutedColor }]}>
								{formatDate(item.createdAt)}
							</Text>
						)}
					</View>
				</View>

				{/* Actions */}
				<View style={styles.actions}>
					<Pressable
						onPress={() => router.push(`/listing/${item.id}/edit`)}
						style={[
							styles.actionBtn,
							{ backgroundColor: isDark ? "#0f172a" : "#f1f5f9" },
						]}
						hitSlop={4}
					>
						<Ionicons name="pencil-outline" size={15} color={primaryColor} />
					</Pressable>
					{item.status === "published" && (
						<Pressable
							onPress={() =>
								showConfirm(
									t("listings.markAsSold"),
									t("listings.markAsSoldConfirm"),
									() => markSold(item.id),
								)
							}
							style={[
								styles.actionBtn,
								{ backgroundColor: isDark ? "#0f172a" : "#f0fdf4" },
							]}
							hitSlop={4}
						>
							<Ionicons name="bag-check-outline" size={15} color="#22c55e" />
						</Pressable>
					)}
					<Pressable
						onPress={() =>
							showConfirm(t("common.delete"), t("listings.deleteConfirm"), () =>
								deleteListing(item.id),
							)
						}
						style={[
							styles.actionBtn,
							{ backgroundColor: isDark ? "#0f172a" : "#fee2e2" },
						]}
						hitSlop={4}
					>
						<Ionicons name="trash-outline" size={15} color="#dc2626" />
					</Pressable>
				</View>
			</AnimatedPressable>
		);
	};

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
					{t("listings.myListings")}
				</Text>
				<Pressable
					onPress={() => router.push("/(tabs)/create")}
					style={[styles.newBtn, { backgroundColor: primaryColor }]}
				>
					<Ionicons name="add" size={18} color="#fff" />
					<Text style={styles.newBtnText}>{t("listings.publish")}</Text>
				</Pressable>
			</View>

			{isLoading ? (
				<ActivityIndicator style={{ margin: 32 }} color={primaryColor} />
			) : (
				<FlatList
					data={filtered}
					keyExtractor={(item) => item.id}
					refreshControl={
						<RefreshControl
							refreshing={refreshing}
							onRefresh={onRefresh}
							tintColor={primaryColor}
						/>
					}
					ListHeaderComponent={
						<View>
							{/* Stats */}
							<View style={styles.statsRow}>
								{STAT_ITEMS.map(({ key, label, color, icon }) => (
									<Pressable
										key={key}
										onPress={() =>
											setActiveFilter(key === "total" ? "all" : key)
										}
										style={[
											styles.statCard,
											{
												backgroundColor: cardBg,
												borderColor:
													activeFilter === (key === "total" ? "all" : key)
														? color
														: borderColor,
												borderWidth:
													activeFilter === (key === "total" ? "all" : key)
														? 2
														: 1,
											},
										]}
									>
										<View
											style={[
												styles.statIconBox,
												{ backgroundColor: `${color}20` },
											]}
										>
											<Ionicons name={icon} size={16} color={color} />
										</View>
										<Text style={[styles.statNum, { color }]}>
											{stats[key]}
										</Text>
										<Text style={[styles.statLabel, { color: mutedColor }]}>
											{label}
										</Text>
									</Pressable>
								))}
							</View>

							{/* Filter tabs */}
							<View
								style={[styles.filterRow, { borderBottomColor: borderColor }]}
							>
								{FILTERS.filter((f) =>
									f.key !== "all"
										? stats[f.key as keyof typeof stats] > 0
										: true,
								).map((f) => {
									const active = activeFilter === f.key;
									return (
										<Pressable
											key={f.key}
											onPress={() => setActiveFilter(f.key)}
											style={[
												styles.filterTab,
												active && {
													borderBottomColor: primaryColor,
													borderBottomWidth: 2,
												},
											]}
										>
											<Text
												style={[
													styles.filterTabText,
													{
														color: active ? primaryColor : mutedColor,
														fontFamily: active ? Fonts.displayBold : Fonts.body,
													},
												]}
											>
												{f.label}
											</Text>
										</Pressable>
									);
								})}
							</View>
						</View>
					}
					ListEmptyComponent={
						<EmptyState
							icon="cube-outline"
							title={
								activeFilter === "all"
									? t("listings.noListings")
									: t("listings.noResults")
							}
							subtitle={
								activeFilter === "all"
									? t("listings.noListingsSubtitle")
									: t("listings.noResultsSubtitle")
							}
							ctaLabel={
								activeFilter === "all" ? t("listings.createFirst") : undefined
							}
							onCta={
								activeFilter === "all"
									? () => router.push("/(tabs)/create")
									: undefined
							}
						/>
					}
					renderItem={renderItem}
					contentContainerStyle={[styles.listContent, centeredContent]}
					showsVerticalScrollIndicator={false}
				/>
			)}
		</SafeAreaView>
	);
}

const styles = StyleSheet.create({
	safe: { flex: 1 },

	/* Header */
	header: {
		flexDirection: "row",
		alignItems: "center",
		paddingHorizontal: 16,
		paddingVertical: 14,
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
		fontSize: 20,
		fontFamily: Fonts.displayBold,
		textAlign: "center",
	},
	newBtn: {
		flexDirection: "row",
		alignItems: "center",
		gap: 4,
		borderRadius: 10,
		paddingHorizontal: 12,
		paddingVertical: 7,
	},
	newBtnText: {
		color: "#fff",
		fontSize: 13,
		fontFamily: Fonts.displayBold,
	},

	/* Stats */
	statsRow: {
		flexDirection: "row",
		gap: 6,
		paddingTop: 16,
		paddingBottom: 16,
	},
	statCard: {
		flex: 1,
		borderRadius: 12,
		borderWidth: 1,
		paddingHorizontal: 12,
		paddingVertical: 14,
		alignItems: "center",
		gap: 4,
	},
	statIconBox: {
		width: 32,
		height: 32,
		borderRadius: 8,
		alignItems: "center",
		justifyContent: "center",
		marginBottom: 2,
	},
	statNum: {
		fontSize: 20,
		fontFamily: Fonts.displayExtrabold,
		lineHeight: 24,
	},
	statLabel: {
		fontSize: 10,
		fontFamily: Fonts.bodySemibold,
		textAlign: "center",
	},

	/* Filter tabs */
	filterRow: {
		flexDirection: "row",
		borderBottomWidth: 1,
		paddingHorizontal: 16,
	},
	filterTab: {
		paddingVertical: 10,
		paddingHorizontal: 4,
		marginRight: 16,
	},
	filterTabText: { fontSize: 13 },

	/* List */
	listContent: {
		paddingHorizontal: 16,
		paddingTop: 12,
		paddingBottom: 32,
		gap: 10,
	},

	/* Card */
	card: {
		flexDirection: "row",
		borderRadius: 14,
		borderWidth: 1,
		overflow: "hidden",
	},
	imageWrap: { position: "relative" },
	image: { width: 90, height: 90 },
	imagePlaceholder: {
		width: 90,
		height: 90,
		alignItems: "center",
		justifyContent: "center",
	},
	boostBadge: {
		position: "absolute",
		top: 6,
		left: 6,
		backgroundColor: "#f59e0b",
		borderRadius: 6,
		width: 18,
		height: 18,
		alignItems: "center",
		justifyContent: "center",
	},

	/* Info */
	info: {
		flex: 1,
		padding: 10,
		gap: 4,
		justifyContent: "center",
	},
	title: {
		fontSize: 14,
		fontFamily: Fonts.bodySemibold,
		lineHeight: 19,
	},
	price: {
		fontSize: 15,
		fontFamily: Fonts.displayBold,
	},
	metaRow: {
		flexDirection: "row",
		alignItems: "center",
		gap: 8,
		flexWrap: "wrap",
	},
	date: {
		fontSize: 11,
		fontFamily: Fonts.body,
	},

	/* Status badge */
	statusBadge: {
		flexDirection: "row",
		alignItems: "center",
		gap: 4,
		borderRadius: 20,
		paddingHorizontal: 8,
		paddingVertical: 3,
		alignSelf: "flex-start",
	},
	statusDot: {
		width: 6,
		height: 6,
		borderRadius: 3,
	},
	statusText: {
		fontSize: 11,
		fontFamily: Fonts.bodySemibold,
	},

	/* Actions */
	actions: {
		padding: 8,
		justifyContent: "center",
		gap: 6,
	},
	actionBtn: {
		width: 34,
		height: 34,
		borderRadius: 10,
		alignItems: "center",
		justifyContent: "center",
	},
});
