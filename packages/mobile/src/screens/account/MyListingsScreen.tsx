import { Ionicons } from "@expo/vector-icons";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Image } from "expo-image";
import { router } from "expo-router";
import React, { useMemo, useState } from "react";
import {
	FlatList,
	Platform,
	Pressable,
	RefreshControl,
	ScrollView,
	StyleSheet,
	Text,
	View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Fonts } from "@/constants/theme";
import { OrderListSkeleton } from "@/src/components/checkout/OrderListSkeleton";
import { EmptyState } from "@/src/components/EmptyState";
import { useGroupedColors } from "@/src/components/settings/Grouped";
import { SettingsHeader } from "@/src/components/settings/SettingsHeader";
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
import { appDateLocale, parseDate } from "@/src/lib/formatDate";
import i18n, { useTranslation } from "@/src/lib/i18n";
import { kindPriceText, listingKindRules } from "@/src/lib/listingKind";
import { formatPrice } from "@/src/lib/market";
import { resolveListingImageUrl } from "@/src/lib/resolveImageUrl";

type FilterKey = "all" | "published" | "pending" | "sold" | "expired";
type Palette = ReturnType<typeof useGroupedColors>;

const isWaiting = (status: string | undefined) =>
	status === "pending" || status === "review" || status === "draft";

/** Each status's words and tone: success live, info moving, danger refused. */
function getStatusConfig(t: (key: string) => string) {
	return {
		published: { label: t("listings.statusPublished"), tone: "success" },
		pending: { label: t("listings.statusPending"), tone: "info" },
		review: { label: t("listings.statusReview"), tone: "info" },
		draft: { label: t("listings.statusDraft"), tone: "neutral" },
		rejected: { label: t("listings.statusRejected"), tone: "danger" },
		sold: { label: t("listings.statusSold"), tone: "neutral" },
		expired: { label: t("listings.statusExpired"), tone: "warning" },
	} as Record<string, { label: string; tone: StatusTone }>;
}

function statusOf(
	status: string,
	kind: string | null | undefined,
	t: (key: string) => string,
): { label: string; tone: StatusTone } {
	const known = getStatusConfig(t)[status];
	// A flat is let and a job filled, not sold.
	if (known && status === "sold") {
		return {
			...known,
			label: t(`listingKind.closedAs.${listingKindRules(kind).closedAs}`),
		};
	}
	return known ?? { label: status, tone: "neutral" };
}

function formatDate(dateStr: string) {
	const date = parseDate(dateStr);
	if (!date) return null;
	return date.toLocaleDateString(appDateLocale(), {
		day: "numeric",
		month: "short",
		year: "numeric",
	});
}

// ── Row action ─────────────────────────────────────────────────────────────────

function RowAction({
	icon,
	label,
	color,
	onPress,
	accessibilityLabel,
	c,
}: {
	icon: keyof typeof Ionicons.glyphMap;
	label: string;
	color: string;
	onPress: () => void;
	accessibilityLabel: string;
	c: Palette;
}) {
	return (
		<Pressable
			onPress={onPress}
			accessibilityRole="button"
			accessibilityLabel={accessibilityLabel}
			android_ripple={{ color: c.well }}
			style={({ pressed }) => [
				styles.rowAction,
				pressed && Platform.OS === "ios" ? { backgroundColor: c.well } : null,
			]}
		>
			<Ionicons name={icon} size={17} color={color} />
			<Text style={[styles.rowActionText, { color }]} numberOfLines={1}>
				{label}
			</Text>
		</Pressable>
	);
}

// ── Screen ─────────────────────────────────────────────────────────────────────

export function MyListingsScreen() {
	const c = useGroupedColors();
	const { centeredContent } = useResponsive();
	const { user } = useAuth();
	const queryClient = useQueryClient();
	const { showConfirm } = useAlert();
	const { t } = useTranslation();
	const [activeFilter, setActiveFilter] = useState<FilterKey>("all");
	const danger = c.isDark ? c.dangerText : c.destructive;

	const { data, isLoading, isError, refetch } = useQuery({
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

	const counts = useMemo(
		() => ({
			all: listings.length,
			published: listings.filter((l: any) => l.status === "published").length,
			pending: listings.filter((l: any) => isWaiting(l.status)).length,
			sold: listings.filter((l: any) => l.status === "sold").length,
			expired: listings.filter((l: any) => l.status === "expired").length,
		}),
		[listings],
	);

	const filtered = useMemo(() => {
		if (activeFilter === "all") return listings;
		if (activeFilter === "pending")
			return listings.filter((l: any) => isWaiting(l.status));
		return listings.filter((l: any) => l.status === activeFilter);
	}, [listings, activeFilter]);

	// One row of filters that also carries the counts; a filter with nothing
	// in it stays hidden, unless it is the one selected.
	const filters: { key: FilterKey; label: string }[] = [
		{ key: "all", label: t("listings.filterAll") },
		{ key: "published", label: t("listings.filterPublished") },
		{ key: "pending", label: t("listings.filterPending") },
		{ key: "sold", label: t("listings.filterSold") },
		{ key: "expired", label: t("listings.filterExpired") },
	];
	const visibleFilters = filters.filter(
		(f) => f.key === "all" || counts[f.key] > 0 || f.key === activeFilter,
	);

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

	const renderItem = ({ item }: { item: any }) => {
		const imgUrl = resolveListingImageUrl(item.images?.[0], "thumbnail");
		const isBoosted = !!(
			item.boostedUntil && new Date(item.boostedUntil) > new Date()
		);
		const status = statusOf(item.status ?? "pending", item.kind, t);
		const date = item.createdAt ? formatDate(item.createdAt) : null;
		const closeLabel = t(
			`listingKind.markClosed.${listingKindRules(item.kind).closedAs}`,
		);
		const price = kindPriceText(
			item.price ? formatPrice(item.price, i18n.language) : null,
			item,
			(key) => i18n.t(`listingKind.${key}`),
		);

		return (
			<View
				style={[
					styles.card,
					{ backgroundColor: c.card, borderColor: c.border },
				]}
			>
				<Pressable
					onPress={() => router.push(`/listing/${item.id}`)}
					accessibilityRole="button"
					accessibilityLabel={[item.title, price, status.label, date]
						.filter(Boolean)
						.join(", ")}
					android_ripple={{ color: c.well }}
					style={({ pressed }) => [
						styles.cardBody,
						pressed && Platform.OS === "ios"
							? { backgroundColor: c.well }
							: null,
					]}
				>
					<View>
						{imgUrl ? (
							<Image
								source={{ uri: imgUrl }}
								style={[styles.image, { backgroundColor: c.well }]}
								contentFit="cover"
							/>
						) : (
							<View
								style={[
									styles.image,
									styles.imagePlaceholder,
									{ backgroundColor: c.well },
								]}
							>
								<Ionicons
									name="image-outline"
									size={24}
									color={c.mutedForeground}
								/>
							</View>
						)}
						{isBoosted ? (
							// Boosted: the signage yellow, ink on it.
							<View style={[styles.boostBadge, { backgroundColor: c.sun }]}>
								<Ionicons name="flash" size={12} color={c.sunForeground} />
							</View>
						) : null}
					</View>

					<View style={styles.info}>
						<Text
							style={[styles.title, { color: c.foreground }]}
							numberOfLines={2}
						>
							{item.title}
						</Text>
						{price ? <AmountTag size="sm" label={price} /> : null}
						<View style={styles.metaRow}>
							<StatusTag label={status.label} tone={status.tone} />
							{date ? (
								<Text style={[styles.date, { color: c.mutedForeground }]}>
									{date}
								</Text>
							) : null}
						</View>
					</View>
				</Pressable>

				<View style={[styles.actions, { borderTopColor: c.border }]}>
					<RowAction
						c={c}
						icon="pencil-outline"
						label={t("common.edit")}
						color={c.link}
						accessibilityLabel={`${t("common.edit")}, ${item.title}`}
						onPress={() => router.push(`/listing/${item.id}/edit`)}
					/>
					{item.status === "published" ? (
						<RowAction
							c={c}
							icon="bag-check-outline"
							label={closeLabel}
							color={c.successText}
							accessibilityLabel={`${closeLabel}, ${item.title}`}
							onPress={() =>
								showConfirm(closeLabel, t("listings.markAsSoldConfirm"), () =>
									markSold(item.id),
								)
							}
						/>
					) : null}
					<RowAction
						c={c}
						icon="trash-outline"
						label={t("common.delete")}
						color={danger}
						accessibilityLabel={`${t("common.delete")}, ${item.title}`}
						onPress={() =>
							showConfirm(t("common.delete"), t("listings.deleteConfirm"), () =>
								deleteListing(item.id),
							)
						}
					/>
				</View>
			</View>
		);
	};

	// The sell action wears the signage yellow, ink on it.
	const newListing = (
		<Pressable
			onPress={() => router.push("/(tabs)/create")}
			accessibilityRole="button"
			accessibilityLabel={t("listings.publish")}
			hitSlop={4}
			style={({ pressed }) => [
				styles.newBtn,
				{ backgroundColor: c.sun, opacity: pressed ? 0.88 : 1 },
			]}
		>
			<Ionicons name="add" size={24} color={c.sunForeground} />
		</Pressable>
	);

	return (
		<SafeAreaView
			edges={["top"]}
			style={[styles.safe, { backgroundColor: c.background }]}
		>
			<SettingsHeader title={t("listings.myListings")} right={newListing} />

			{isLoading ? (
				<OrderListSkeleton rows={5} />
			) : isError && listings.length === 0 ? (
				<EmptyState
					icon="alert-circle-outline"
					title={t("common.error")}
					ctaLabel={t("common.retry")}
					onCta={() => void refetch()}
				/>
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
						listings.length > 0 ? (
							<ScrollView
								horizontal
								showsHorizontalScrollIndicator={false}
								contentContainerStyle={styles.filterRow}
								style={styles.filterScroll}
								accessibilityRole="tablist"
							>
								{visibleFilters.map((f) => {
									const active = activeFilter === f.key;
									return (
										<Pressable
											key={f.key}
											onPress={() => setActiveFilter(f.key)}
											accessibilityRole="tab"
											accessibilityState={{ selected: active }}
											accessibilityLabel={`${f.label}, ${counts[f.key]}`}
											style={[
												styles.filterChip,
												active
													? {
															backgroundColor: c.primaryFill,
															borderColor: c.primaryFill,
														}
													: {
															backgroundColor: c.card,
															borderColor: c.borderStrong,
														},
											]}
										>
											<Text
												style={[
													styles.filterText,
													{ color: active ? "#ffffff" : c.foreground },
												]}
											>
												{f.label}
											</Text>
											<Text
												style={[
													styles.filterCount,
													{ color: active ? "#ffffff" : c.mutedForeground },
												]}
											>
												{counts[f.key]}
											</Text>
										</Pressable>
									);
								})}
							</ScrollView>
						) : null
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

	newBtn: {
		width: 44,
		height: 44,
		borderRadius: 12,
		alignItems: "center",
		justifyContent: "center",
	},

	/* Filters */
	filterScroll: { flexGrow: 0, marginHorizontal: -16 },
	filterRow: {
		flexDirection: "row",
		gap: 8,
		paddingHorizontal: 16,
		paddingBottom: 16,
	},
	filterChip: {
		flexDirection: "row",
		alignItems: "center",
		gap: 6,
		minHeight: 40,
		borderRadius: 999,
		borderWidth: 1,
		paddingHorizontal: 14,
	},
	filterText: { fontSize: 14, fontFamily: Fonts.bodySemibold },
	filterCount: { fontSize: 14, fontFamily: Fonts.displayBold },

	/* List */
	listContent: {
		paddingHorizontal: 16,
		paddingTop: 16,
		paddingBottom: 48,
		gap: 12,
		flexGrow: 1,
	},

	/* Card */
	card: {
		borderRadius: 14,
		borderWidth: StyleSheet.hairlineWidth,
		overflow: "hidden",
	},
	cardBody: {
		flexDirection: "row",
		gap: 12,
		padding: 12,
	},
	image: { width: 84, height: 84, borderRadius: 10 },
	imagePlaceholder: { alignItems: "center", justifyContent: "center" },
	boostBadge: {
		position: "absolute",
		top: 6,
		left: 6,
		borderRadius: 6,
		width: 22,
		height: 22,
		alignItems: "center",
		justifyContent: "center",
	},
	info: { flex: 1, gap: 6, justifyContent: "center" },
	title: { fontSize: 15, lineHeight: 20, fontFamily: Fonts.bodySemibold },
	metaRow: {
		flexDirection: "row",
		alignItems: "center",
		gap: 8,
		flexWrap: "wrap",
	},
	date: { fontSize: 12, lineHeight: 16, fontFamily: Fonts.body },

	/* Actions */
	actions: {
		flexDirection: "row",
		borderTopWidth: StyleSheet.hairlineWidth,
	},
	rowAction: {
		flex: 1,
		flexDirection: "row",
		alignItems: "center",
		justifyContent: "center",
		gap: 6,
		minHeight: 44,
		paddingHorizontal: 8,
	},
	rowActionText: { fontSize: 14, fontFamily: Fonts.bodySemibold },
});
