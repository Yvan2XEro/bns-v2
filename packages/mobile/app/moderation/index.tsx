import { Ionicons } from "@expo/vector-icons";
import { Image } from "expo-image";
import { router } from "expo-router";
import { useCallback, useMemo, useState } from "react";
import {
	ActivityIndicator,
	FlatList,
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
import {
	useModerationSummary,
	usePendingListings,
	usePendingReports,
} from "@/src/hooks/useModeration";
import { useResponsive } from "@/src/hooks/useResponsive";
import { useTranslation } from "@/src/lib/i18n";
import { resolveListingImageUrl } from "@/src/lib/resolveImageUrl";
import type { ListingDoc, ReportDoc, UserDoc } from "@/src/types/api";

type QueueKey = "listings" | "reports";

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

	const active = queue === "listings" ? listings : reports;

	const items = useMemo<(ListingDoc | ReportDoc)[]>(
		() =>
			(active.data?.pages ?? []).flatMap(
				(page) => page.docs as (ListingDoc | ReportDoc)[],
			),
		[active.data],
	);

	const onRefresh = useCallback(async () => {
		setRefreshing(true);
		await Promise.all([active.refetch(), summary.refetch()]);
		setRefreshing(false);
	}, [active, summary]);

	const tabs: { key: QueueKey; label: string; count: number }[] = [
		{
			key: "listings",
			label: t("moderation.tabListings"),
			count: summary.data?.pendingListings ?? 0,
		},
		{
			key: "reports",
			label: t("moderation.tabReports"),
			count: summary.data?.pendingReports ?? 0,
		},
	];

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
							{tab.count > 0 ? (
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

			{active.isLoading ? (
				<ActivityIndicator style={{ marginTop: 40 }} color={c.primary} />
			) : (
				<FlatList
					data={items}
					keyExtractor={(item) => item.id}
					contentContainerStyle={[
						{ padding: 16, gap: 10, flexGrow: 1 },
						centeredContent,
					]}
					refreshControl={
						<RefreshControl
							refreshing={refreshing}
							onRefresh={onRefresh}
							tintColor={c.primary}
						/>
					}
					onEndReached={() => {
						if (active.hasNextPage && !active.isFetchingNextPage) {
							active.fetchNextPage();
						}
					}}
					onEndReachedThreshold={0.4}
					ListEmptyComponent={
						<EmptyState
							illustration="empty"
							title={
								queue === "listings"
									? t("moderation.emptyListingsTitle")
									: t("moderation.emptyReportsTitle")
							}
							subtitle={t("moderation.emptySubtitle")}
						/>
					}
					ListFooterComponent={
						active.isFetchingNextPage ? (
							<ActivityIndicator style={{ margin: 16 }} color={c.primary} />
						) : null
					}
					renderItem={({ item }) =>
						queue === "listings" ? (
							<ListingRow listing={item as ListingDoc} t={t} c={c} />
						) : (
							<ReportRow report={item as ReportDoc} t={t} c={c} />
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
			onPress={() => router.push(`/moderation/listing/${listing.id}`)}
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
			onPress={() => router.push(`/moderation/report/${report.id}`)}
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
