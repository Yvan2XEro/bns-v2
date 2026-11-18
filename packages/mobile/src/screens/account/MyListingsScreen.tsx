import { Ionicons } from "@expo/vector-icons";
import {
	useInfiniteQuery,
	useMutation,
	useQuery,
	useQueryClient,
} from "@tanstack/react-query";
import { Image } from "expo-image";
import { router, useLocalSearchParams } from "expo-router";
import React, { useMemo, useState } from "react";
import {
	ActivityIndicator,
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
import { resolveErrorMessage } from "@/src/lib/apiError";
import { useAuth } from "@/src/lib/auth";
import { withContentLocale } from "@/src/lib/contentLocale";
import { appDateLocale, parseDate } from "@/src/lib/formatDate";
import i18n, { useTranslation } from "@/src/lib/i18n";
import { kindPriceText, listingKindRules } from "@/src/lib/listingKind";
import { formatPrice } from "@/src/lib/market";
import { resolveListingImageUrl } from "@/src/lib/resolveImageUrl";
import { rejectionText } from "../../../../api/src/contracts/listingRejection";

type FilterKey =
	| "all"
	| "published"
	| "pending"
	| "rejected"
	| "sold"
	| "expired";

const FILTER_KEYS: FilterKey[] = [
	"all",
	"published",
	"pending",
	"rejected",
	"sold",
	"expired",
];

/** `?filter=` opens on one chip; a draft waits with the pending ones. */
function initialFilter(param: string | string[] | undefined): FilterKey {
	const value = Array.isArray(param) ? param[0] : param;
	if (value === "draft") return "pending";
	return FILTER_KEYS.includes(value as FilterKey)
		? (value as FilterKey)
		: "all";
}

const PAGE_SIZE = 20;
const WAITING_STATUSES = ["pending", "review", "draft"];

/** The server-side filter for one chip: lists are paged, so it cannot be local. */
function statusWhere(filter: FilterKey): string {
	if (filter === "all") return "";
	if (filter === "pending") {
		return `&where[status][in]=${WAITING_STATUSES.join(",")}`;
	}
	return `&where[status][equals]=${filter}`;
}
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
	disabled,
	c,
}: {
	icon: keyof typeof Ionicons.glyphMap;
	label: string;
	color: string;
	onPress: () => void;
	accessibilityLabel: string;
	disabled?: boolean;
	c: Palette;
}) {
	return (
		<Pressable
			onPress={onPress}
			disabled={disabled}
			accessibilityRole="button"
			accessibilityLabel={accessibilityLabel}
			accessibilityState={{ disabled: Boolean(disabled) }}
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
	const { showConfirm, showError, showSuccess, confirm } = useAlert();
	const { t } = useTranslation();
	const params = useLocalSearchParams<{ filter?: string }>();
	const [activeFilter, setActiveFilter] = useState<FilterKey>(() =>
		initialFilter(params.filter),
	);
	const danger = c.isDark ? c.dangerText : c.destructive;

	// Paged by the server and filtered there, so a shop with 200 listings
	// sees all of them, page by page, in every chip.
	const {
		data,
		isLoading,
		isError,
		refetch,
		hasNextPage,
		fetchNextPage,
		isFetchingNextPage,
	} = useInfiniteQuery({
		queryKey: ["my-listings", activeFilter],
		queryFn: ({ pageParam = 1 }) =>
			api.get<{
				docs: any[];
				totalDocs: number;
				hasNextPage: boolean;
				nextPage: number | null;
			}>(
				withContentLocale(
					`/api/listings?where[seller][equals]=${user?.id}${statusWhere(activeFilter)}&limit=${PAGE_SIZE}&page=${pageParam}&sort=-createdAt&depth=1&draft=true`,
				),
			),
		getNextPageParam: (lastPage) =>
			lastPage?.hasNextPage ? lastPage.nextPage : undefined,
		initialPageParam: 1,
		enabled: !!user,
	});

	const filtered = useMemo(
		() => data?.pages.flatMap((page) => page?.docs ?? []) ?? [],
		[data],
	);

	// The chips' counts come from every listing's status alone (a few bytes
	// each), not from the page loaded so far.
	const { data: statusData } = useQuery({
		queryKey: ["my-listings", "counts"],
		queryFn: () =>
			api.get<{ docs: { status?: string }[]; totalDocs: number }>(
				`/api/listings?where[seller][equals]=${user?.id}&select[status]=true&depth=0&limit=1000&draft=true`,
			),
		enabled: !!user,
	});
	const statuses = statusData?.docs ?? [];
	const counts: Record<FilterKey, number> = {
		all: statusData?.totalDocs ?? statuses.length,
		published: statuses.filter((l) => l.status === "published").length,
		pending: statuses.filter((l) => isWaiting(l.status)).length,
		rejected: statuses.filter((l) => l.status === "rejected").length,
		sold: statuses.filter((l) => l.status === "sold").length,
		expired: statuses.filter((l) => l.status === "expired").length,
	};
	const hasAny = counts.all > 0 || filtered.length > 0;

	// One row of filters that also carries the counts; a filter with nothing
	// in it stays hidden, unless it is the one selected.
	const filters: { key: FilterKey; label: string }[] = [
		{ key: "all", label: t("listings.filterAll") },
		{ key: "published", label: t("listings.filterPublished") },
		{ key: "pending", label: t("listings.filterPending") },
		{
			key: "rejected",
			label: t("listings.filterRejected", { defaultValue: "Refusées" }),
		},
		{ key: "sold", label: t("listings.filterSold") },
		{ key: "expired", label: t("listings.filterExpired") },
	];
	const visibleFilters = filters.filter(
		(f) => f.key === "all" || counts[f.key] > 0 || f.key === activeFilter,
	);

	// Offline or on a timeout, a confirmed action says so instead of leaving
	// the card as it was; while it runs, the card is dimmed and its actions
	// are off.
	const onActionError = (err: unknown) =>
		showError(t("common.error"), resolveErrorMessage(err, t));

	const {
		mutate: markSold,
		isPending: markingSold,
		variables: soldId,
	} = useMutation({
		mutationFn: (id: string) =>
			api.patch(`/api/listings/${id}`, { status: "sold" }),
		onSuccess: () => {
			showSuccess(
				t("listings.markedSold", {
					defaultValue: "Annonce marquée comme vendue",
				}),
			);
			return queryClient.invalidateQueries({ queryKey: ["my-listings"] });
		},
		onError: onActionError,
	});

	const {
		mutate: deleteListing,
		isPending: deletingListing,
		variables: deletedId,
	} = useMutation({
		mutationFn: (id: string) => api.delete(`/api/listings/${id}`),
		onSuccess: () => {
			showSuccess(t("listings.deleted", { defaultValue: "Annonce supprimée" }));
			return queryClient.invalidateQueries({ queryKey: ["my-listings"] });
		},
		onError: onActionError,
	});

	const busyId = markingSold ? soldId : deletingListing ? deletedId : null;

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
		const busy = busyId === item.id;
		const rejected = item.status === "rejected";
		const reason = rejected
			? rejectionText(item, (code) => t(`listingRejection.${code}`))
			: null;
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
					busy ? styles.cardBusy : null,
				]}
				accessibilityState={{ busy }}
			>
				<Pressable
					onPress={() => router.push(`/listing/${item.id}`)}
					accessibilityRole="button"
					accessibilityLabel={[item.title, price, status.label, reason, date]
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
							{busy ? <ActivityIndicator size="small" color={c.link} /> : null}
						</View>
						{/* A refused listing says why, so the fix is obvious. */}
						{reason ? (
							<Text
								style={[styles.reason, { color: c.dangerText }]}
								numberOfLines={3}
							>
								{reason}
							</Text>
						) : null}
					</View>
				</Pressable>

				<View style={[styles.actions, { borderTopColor: c.border }]}>
					<RowAction
						c={c}
						icon={rejected ? "refresh-outline" : "pencil-outline"}
						label={
							rejected
								? t("listings.fixAndResubmit", {
										defaultValue: "Corriger et renvoyer",
									})
								: t("common.edit")
						}
						color={c.link}
						disabled={busy}
						accessibilityLabel={`${
							rejected
								? t("listings.fixAndResubmit", {
										defaultValue: "Corriger et renvoyer",
									})
								: t("common.edit")
						}, ${item.title}`}
						onPress={() => router.push(`/listing/${item.id}/edit`)}
					/>
					{item.status === "published" ? (
						<RowAction
							c={c}
							icon="bag-check-outline"
							label={closeLabel}
							color={c.successText}
							accessibilityLabel={`${closeLabel}, ${item.title}`}
							disabled={busy}
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
						disabled={busy}
						onPress={async () => {
							// Named, so two near-identical titles cannot be confused.
							const ok = await confirm(
								t("listings.deleteNamedConfirm", {
									title: item.title,
									defaultValue: "Supprimer « {{title}} » ?",
								}),
								t("listings.deleteNamedMessage", {
									defaultValue:
										"L'annonce disparaît pour les acheteurs. Vous ne pourrez pas la récupérer.",
								}),
								{ destructive: true, confirmText: t("common.delete") },
							);
							if (ok) deleteListing(item.id);
						}}
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
			) : isError && filtered.length === 0 ? (
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
					onEndReached={() => {
						if (hasNextPage && !isFetchingNextPage) void fetchNextPage();
					}}
					onEndReachedThreshold={0.5}
					ListFooterComponent={
						isFetchingNextPage ? (
							<ActivityIndicator style={styles.footer} color={c.link} />
						) : null
					}
					ListHeaderComponent={
						hasAny ? (
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

	cardBusy: { opacity: 0.55 },
	reason: {
		fontSize: 15,
		lineHeight: 22,
		fontFamily: Fonts.bodyMedium,
		marginTop: 4,
	},
	footer: { paddingVertical: 16 },
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
	filterText: { fontSize: 15, lineHeight: 22, fontFamily: Fonts.bodySemibold },
	filterCount: { fontSize: 15, lineHeight: 22, fontFamily: Fonts.displayBold },

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
	rowActionText: {
		fontSize: 15,
		lineHeight: 22,
		fontFamily: Fonts.bodySemibold,
	},
});
