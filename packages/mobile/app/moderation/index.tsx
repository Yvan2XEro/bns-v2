import { Ionicons } from "@expo/vector-icons";
import { FlashList } from "@shopify/flash-list";
import { Image } from "expo-image";
import { router } from "expo-router";
import { useCallback, useMemo, useState } from "react";
import {
	ActivityIndicator,
	Pressable,
	RefreshControl,
	StyleSheet,
	Text,
	View,
} from "react-native";
import { Fonts } from "@/constants/theme";
import { EmptyState } from "@/src/components/EmptyState";
import { ModerationScreen } from "@/src/components/moderation/ModerationScreen";
import {
	type Translate,
	useModerationTheme,
} from "@/src/components/moderation/theme";
import { VerificationCard } from "@/src/components/moderation/VerificationCard";
import {
	useModerationSummary,
	usePendingListings,
	usePendingReports,
} from "@/src/hooks/useModeration";
import { useVerificationQueue } from "@/src/hooks/useModerationVerification";
import { useResponsive } from "@/src/hooks/useResponsive";
import { useTranslation } from "@/src/lib/i18n";
import { capitalize, queueTabs } from "@/src/lib/moderationVerification";
import { resolveListingImageUrl } from "@/src/lib/resolveImageUrl";
import type {
	ListingDoc,
	ModerationVerificationQueueItem,
	ReportDoc,
	UserDoc,
} from "@/src/types/api";

type QueueKey = "listings" | "reports" | "verification";

function relativeAge(iso: string, t: Translate): string {
	const minutes = Math.max(
		0,
		Math.round((Date.now() - new Date(iso).getTime()) / 60000),
	);
	if (minutes < 60) return t("moderation.ageMinutes", { count: minutes });
	const hours = Math.round(minutes / 60);
	if (hours < 24) return t("moderation.ageHours", { count: hours });
	return t("moderation.ageDays", { count: Math.round(hours / 24) });
}

function nameOf(value: UserDoc | string | null | undefined): string | null {
	if (!value || typeof value === "string") return null;
	return value.name || value.email || null;
}

export default function ModerationHubScreen() {
	const c = useModerationTheme();
	const { t } = useTranslation();
	const { centeredContent } = useResponsive();
	const [queue, setQueue] = useState<QueueKey>("listings");
	const [refreshing, setRefreshing] = useState(false);

	const summary = useModerationSummary();
	const listings = usePendingListings();
	const reports = usePendingReports();
	// Never gated on the verification feature flag: a review already in flight
	// must finish reviewing while intake is paused, so the hub only ever asks
	// for the fixed "to_review" queue and never reads the flag.
	const verifications = useVerificationQueue("to_review");

	const isLoading =
		queue === "listings"
			? listings.isLoading
			: queue === "reports"
				? reports.isLoading
				: verifications.isLoading;

	const items = useMemo<
		(ListingDoc | ReportDoc | ModerationVerificationQueueItem)[]
	>(() => {
		if (queue === "listings") {
			return (listings.data?.pages ?? []).flatMap(
				(page) => page.docs as ListingDoc[],
			);
		}
		if (queue === "reports") {
			return (reports.data?.pages ?? []).flatMap(
				(page) => page.docs as ReportDoc[],
			);
		}
		return verifications.data?.items ?? [];
	}, [queue, listings.data, reports.data, verifications.data]);

	// `verifications` has no pagination — the reviewer queue is a flat,
	// bounded list, never an infinite one — so only the other two tabs ever
	// load a next page or show a footer spinner.
	const infiniteActive =
		queue === "listings" ? listings : queue === "reports" ? reports : null;

	const onRefresh = useCallback(async () => {
		setRefreshing(true);
		const active =
			queue === "listings"
				? listings
				: queue === "reports"
					? reports
					: verifications;
		await Promise.all([active.refetch(), summary.refetch()]);
		setRefreshing(false);
	}, [queue, listings, reports, verifications, summary]);

	const tabs = queueTabs(summary.data).map((tab) => ({
		...tab,
		label: t(`moderation.tab${capitalize(tab.key)}`),
	}));

	return (
		<ModerationScreen
			title={t("moderation.title")}
			subtitle={
				summary.data
					? t("moderation.pendingTotal", { count: summary.data.total })
					: undefined
			}
		>
			<View style={[styles.tabs, { borderBottomColor: c.border }]}>
				{tabs.map((tab) => {
					const selected = queue === tab.key;
					return (
						<Pressable
							key={tab.key}
							accessibilityRole="tab"
							accessibilityState={{ selected }}
							onPress={() => setQueue(tab.key)}
							style={[
								styles.tab,
								selected && {
									borderBottomColor: c.primary,
									borderBottomWidth: 2,
								},
							]}
						>
							<Text
								style={[
									styles.tabLabel,
									{ color: selected ? c.primary : c.muted },
								]}
							>
								{tab.label}
							</Text>
							{typeof tab.count === "number" && tab.count > 0 ? (
								<View
									style={[
										styles.tabBadge,
										{ backgroundColor: selected ? c.primary : c.border },
									]}
								>
									<Text
										style={[
											styles.tabBadgeText,
											{ color: selected ? "#fff" : c.muted },
										]}
									>
										{tab.count}
									</Text>
								</View>
							) : null}
						</Pressable>
					);
				})}
			</View>

			{isLoading ? (
				<ActivityIndicator style={{ marginTop: 40 }} color={c.primary} />
			) : (
				<FlashList
					data={items}
					keyExtractor={(item) => item.id}
					contentContainerStyle={{
						padding: 16,
						...(centeredContent ? centeredContent : null),
					}}
					ItemSeparatorComponent={() => <View style={{ height: 10 }} />}
					refreshControl={
						<RefreshControl
							refreshing={refreshing}
							onRefresh={onRefresh}
							tintColor={c.primary}
						/>
					}
					onEndReached={() => {
						if (
							infiniteActive?.hasNextPage &&
							!infiniteActive.isFetchingNextPage
						) {
							infiniteActive.fetchNextPage();
						}
					}}
					onEndReachedThreshold={0.4}
					ListEmptyComponent={
						<EmptyState
							illustration="empty"
							title={
								queue === "listings"
									? t("moderation.emptyListingsTitle")
									: queue === "reports"
										? t("moderation.emptyReportsTitle")
										: t("moderation.emptyVerificationTitle")
							}
							subtitle={t("moderation.emptySubtitle")}
						/>
					}
					ListFooterComponent={
						infiniteActive?.isFetchingNextPage ? (
							<ActivityIndicator style={{ margin: 16 }} color={c.primary} />
						) : null
					}
					renderItem={({ item }) =>
						queue === "listings" ? (
							<ListingRow listing={item as ListingDoc} t={t} c={c} />
						) : queue === "reports" ? (
							<ReportRow report={item as ReportDoc} t={t} c={c} />
						) : (
							<VerificationCard
								item={item as ModerationVerificationQueueItem}
							/>
						)
					}
				/>
			)}
		</ModerationScreen>
	);
}

function ListingRow({
	listing,
	t,
	c,
}: {
	listing: ListingDoc;
	t: Translate;
	c: ReturnType<typeof useModerationTheme>;
}) {
	const thumb = resolveListingImageUrl(listing.images?.[0]);
	const seller = nameOf(listing.seller);

	return (
		<Pressable
			onPress={() => router.push(`/moderation/listing/${listing.id}` as never)}
			style={[styles.card, { backgroundColor: c.card, borderColor: c.border }]}
		>
			{thumb ? (
				<Image
					source={{ uri: thumb }}
					style={styles.thumb}
					contentFit="cover"
				/>
			) : (
				<View
					style={[styles.thumb, styles.thumbEmpty, { backgroundColor: c.bg }]}
				>
					<Ionicons name="image-outline" size={22} color={c.muted} />
				</View>
			)}
			<View style={styles.cardBody}>
				<Text style={[styles.cardTitle, { color: c.text }]} numberOfLines={2}>
					{listing.title}
				</Text>
				<Text style={[styles.cardMeta, { color: c.muted }]} numberOfLines={1}>
					{[seller, relativeAge(listing.createdAt, t)]
						.filter(Boolean)
						.join(" · ")}
				</Text>
			</View>
			<Ionicons name="chevron-forward" size={18} color={c.muted} />
		</Pressable>
	);
}

function ReportRow({
	report,
	t,
	c,
}: {
	report: ReportDoc;
	t: Translate;
	c: ReturnType<typeof useModerationTheme>;
}) {
	const reporter = nameOf(report.reporter);

	return (
		<Pressable
			onPress={() => router.push(`/moderation/report/${report.id}` as never)}
			style={[styles.card, { backgroundColor: c.card, borderColor: c.border }]}
		>
			<View style={[styles.reportIcon, { backgroundColor: c.dangerSoft }]}>
				<Ionicons name="flag" size={18} color={c.danger} />
			</View>
			<View style={styles.cardBody}>
				<Text style={[styles.cardTitle, { color: c.text }]} numberOfLines={1}>
					{t(`report.${report.reason}`)}
				</Text>
				<Text style={[styles.cardMeta, { color: c.muted }]} numberOfLines={1}>
					{[
						t(`moderation.target_${report.targetType}`),
						reporter,
						relativeAge(report.createdAt, t),
					]
						.filter(Boolean)
						.join(" · ")}
				</Text>
			</View>
			<Ionicons name="chevron-forward" size={18} color={c.muted} />
		</Pressable>
	);
}

const styles = StyleSheet.create({
	tabs: { flexDirection: "row", borderBottomWidth: StyleSheet.hairlineWidth },
	tab: {
		flex: 1,
		flexDirection: "row",
		alignItems: "center",
		justifyContent: "center",
		gap: 6,
		paddingVertical: 14,
		borderBottomWidth: 2,
		borderBottomColor: "transparent",
	},
	tabLabel: { fontSize: 14, fontFamily: Fonts.bodySemibold },
	tabBadge: {
		minWidth: 20,
		paddingHorizontal: 6,
		height: 20,
		borderRadius: 10,
		alignItems: "center",
		justifyContent: "center",
	},
	tabBadgeText: { fontSize: 11, fontFamily: Fonts.displayBold },
	card: {
		flexDirection: "row",
		alignItems: "center",
		gap: 12,
		borderRadius: 14,
		borderWidth: StyleSheet.hairlineWidth,
		padding: 12,
	},
	thumb: { width: 56, height: 56, borderRadius: 10 },
	thumbEmpty: { alignItems: "center", justifyContent: "center" },
	reportIcon: {
		width: 40,
		height: 40,
		borderRadius: 20,
		alignItems: "center",
		justifyContent: "center",
	},
	cardBody: { flex: 1, gap: 3 },
	cardTitle: { fontSize: 14, fontFamily: Fonts.bodySemibold },
	cardMeta: { fontSize: 12, fontFamily: Fonts.body },
});
