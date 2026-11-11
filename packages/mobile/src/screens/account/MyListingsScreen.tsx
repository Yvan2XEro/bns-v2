import { Ionicons } from "@expo/vector-icons";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Image } from "expo-image";
import { router } from "expo-router";
import React, { useMemo, useState } from "react";
import {
	FlatList,
	Pressable,
	RefreshControl,
	StyleSheet,
	Text,
	View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Colors, Fonts } from "@/constants/theme";
import { useColorScheme } from "@/hooks/use-color-scheme";
import { AnimatedPressable } from "@/src/components/AnimatedPressable";
import { OrderListSkeleton } from "@/src/components/checkout/OrderListSkeleton";
import { EmptyState } from "@/src/components/EmptyState";
import { HeaderBackButton } from "@/src/components/layout/HeaderBackButton";
import {
	AmountTag,
	StatusTag,
	type StatusTone,
} from "@/src/components/shop/Tags";
import { useAlert } from "@/src/contexts/AlertContext";
import { useResponsive } from "@/src/hooks/useResponsive";
import { api } from "@/src/lib/api";
import { useAuth } from "@/src/lib/auth";
import { withContentLocale } from "@/src/lib/contentLocale";
import { appDateLocale } from "@/src/lib/formatDate";
import i18n, { useTranslation } from "@/src/lib/i18n";
import { kindPriceText, listingKindRules } from "@/src/lib/listingKind";
import { formatPrice } from "@/src/lib/market";
import { resolveListingImageUrl } from "@/src/lib/resolveImageUrl";

type FilterKey = "all" | "published" | "pending" | "sold" | "expired";

/** Each status's words and tone: success live, info moving, danger refused. */
function getStatusConfig(t: (key: string) => string) {
	return {
		published: { label: t("listings.statusPublished"), tone: "success" },
		pending: { label: t("listings.statusPending"), tone: "info" },
		review: { label: t("listings.statusReview"), tone: "info" },
		rejected: { label: t("listings.statusRejected"), tone: "danger" },
		sold: { label: t("listings.statusSold"), tone: "neutral" },
		expired: { label: t("listings.statusExpired"), tone: "warning" },
	} as Record<string, { label: string; tone: StatusTone }>;
}

function StatusBadge({
	status,
	kind,
	t,
}: {
	status: string;
	/** A flat is let and a job filled, not sold. */
	kind?: string | null;
	t: (key: string) => string;
}) {
	const known = getStatusConfig(t)[status];
	const cfg = (known && status === "sold"
		? {
				...known,
				label: t(`listingKind.closedAs.${listingKindRules(kind).closedAs}`),
			}
		: known) ?? { label: status, tone: "neutral" as const };
	return <StatusTag label={cfg.label} tone={cfg.tone} />;
}

function formatDate(dateStr: string) {
	return new Date(dateStr).toLocaleDateString(appDateLocale(), {
		day: "2-digit",
		month: "short",
		year: "numeric",
	});
}

export function MyListingsScreen() {
	const isDark = useColorScheme() === "dark";
	const { centeredContent } = useResponsive();
	const { user } = useAuth();
	const queryClient = useQueryClient();
	const { showConfirm } = useAlert();
	const { t } = useTranslation();
	const [activeFilter, setActiveFilter] = useState<FilterKey>("all");

	const c = Colors[isDark ? "dark" : "light"];
	const bg = c.background;
	const cardBg = c.card;
	const textColor = c.foreground;
	const mutedColor = c.mutedForeground;
	/** Brand words and outlines. */
	const primaryColor = c.link;
	const borderColor = c.border;
	const danger = isDark ? c.dangerText : c.destructive;

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
				withContentLocale(
					`/api/listings?where[seller][equals]=${user?.id}&limit=50&sort=-createdAt&depth=1&draft=true`,
				),
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
			color: c.successText,
			icon: "checkmark-circle-outline" as const,
		},
		{
			key: "pending" as const,
			label: t("listings.pending"),
			color: c.link,
			icon: "time-outline" as const,
		},
		{
			key: "sold" as const,
			label: t("listings.sold"),
			color: c.body,
			icon: "bag-check-outline" as const,
		},
	];

	const renderItem = ({ item }: { item: any }) => {
		const imgUrl = resolveListingImageUrl(item.images?.[0], "thumbnail");
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
							style={[styles.imagePlaceholder, { backgroundColor: c.well }]}
						>
							<Ionicons name="image-outline" size={24} color={mutedColor} />
						</View>
					)}
					{isBoosted && (
						<View style={styles.boostBadge}>
							<Ionicons name="flash" size={11} color={c.sunForeground} />
						</View>
					)}
				</View>

				{/* Info */}
				<View style={styles.info}>
					<Text style={[styles.title, { color: textColor }]} numberOfLines={2}>
						{item.title}
					</Text>
					<AmountTag
						size="sm"
						label={kindPriceText(
							item.price ? formatPrice(item.price, i18n.language) : null,
							item,
							(key) => i18n.t(`listingKind.${key}`),
						)}
					/>
					<View style={styles.metaRow}>
						<StatusBadge
							status={item.status ?? "pending"}
							kind={item.kind}
							t={t}
						/>
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
						accessibilityRole="button"
						accessibilityLabel={`${t("common.edit")}, ${item.title}`}
						style={[styles.actionBtn, { backgroundColor: c.well }]}
						hitSlop={4}
					>
						<Ionicons name="pencil-outline" size={18} color={primaryColor} />
					</Pressable>
					{item.status === "published" && (
						<Pressable
							onPress={() =>
								showConfirm(
									t(
										`listingKind.markClosed.${listingKindRules(item.kind).closedAs}`,
									),
									t("listings.markAsSoldConfirm"),
									() => markSold(item.id),
								)
							}
							accessibilityRole="button"
							accessibilityLabel={`${t(
								`listingKind.markClosed.${listingKindRules(item.kind).closedAs}`,
							)}, ${item.title}`}
							style={[styles.actionBtn, { backgroundColor: c.successTint }]}
							hitSlop={4}
						>
							<Ionicons
								name="bag-check-outline"
								size={18}
								color={c.successText}
							/>
						</Pressable>
					)}
					<Pressable
						onPress={() =>
							showConfirm(t("common.delete"), t("listings.deleteConfirm"), () =>
								deleteListing(item.id),
							)
						}
						accessibilityRole="button"
						accessibilityLabel={`${t("common.delete")}, ${item.title}`}
						style={[styles.actionBtn, { backgroundColor: c.dangerTint }]}
						hitSlop={4}
					>
						<Ionicons name="trash-outline" size={18} color={danger} />
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
				<HeaderBackButton
					color={textColor}
					fallback="/(tabs)/account"
					style={styles.backBtn}
				/>
				<Text
					accessibilityRole="header"
					style={[styles.headerTitle, { color: textColor }]}
				>
					{t("listings.myListings")}
				</Text>
				{/* The sell action wears the signage yellow, ink on it. */}
				<Pressable
					onPress={() => router.push("/(tabs)/create")}
					accessibilityRole="button"
					hitSlop={4}
					style={[styles.newBtn, { backgroundColor: c.sun }]}
				>
					<Ionicons name="add" size={18} color={c.sunForeground} />
					<Text style={styles.newBtnText}>{t("listings.publish")}</Text>
				</Pressable>
			</View>

			{isLoading ? (
				<OrderListSkeleton rows={5} />
			) : (
				<FlatList
					data={filtered}
					keyExtractor={(item) => item.id}
					refreshControl={
						<RefreshControl
							refreshing={refreshing}
							onRefresh={onRefresh}
							tintColor={c.primary}
							colors={[c.primary]}
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
										accessibilityRole="button"
										accessibilityLabel={`${label}: ${stats[key]}`}
										accessibilityState={{
											selected:
												activeFilter === (key === "total" ? "all" : key),
										}}
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
											accessibilityRole="tab"
											accessibilityState={{ selected: active }}
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
														fontFamily: active
															? Fonts.bodyBold
															: Fonts.bodyMedium,
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
		fontSize: 18,
		fontFamily: Fonts.displayBold,
		textAlign: "center",
	},
	newBtn: {
		flexDirection: "row",
		alignItems: "center",
		gap: 4,
		minHeight: 40,
		borderRadius: 12,
		paddingHorizontal: 12,
	},
	newBtnText: {
		color: "#12163a",
		fontSize: 14,
		fontFamily: Fonts.bodyBold,
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
		fontSize: 12,
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
		minHeight: 44,
		justifyContent: "center",
		paddingHorizontal: 4,
		marginRight: 16,
	},
	filterTabText: { fontSize: 14 },

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
		borderWidth: StyleSheet.hairlineWidth,
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
		backgroundColor: "#ffb81c",
		borderRadius: 6,
		width: 20,
		height: 20,
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
		fontSize: 15,
		fontFamily: Fonts.bodySemibold,
		lineHeight: 20,
	},
	metaRow: {
		flexDirection: "row",
		alignItems: "center",
		gap: 8,
		flexWrap: "wrap",
	},
	date: {
		fontSize: 12,
		fontFamily: Fonts.body,
	},

	/* Actions */
	actions: {
		padding: 8,
		justifyContent: "center",
		gap: 6,
	},
	actionBtn: {
		width: 40,
		height: 40,
		borderRadius: 10,
		alignItems: "center",
		justifyContent: "center",
	},
});
