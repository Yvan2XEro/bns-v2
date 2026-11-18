import { Ionicons } from "@expo/vector-icons";
import { FlashList } from "@shopify/flash-list";
import { Image } from "expo-image";
import { router } from "expo-router";
import { type ReactNode, useCallback, useMemo, useState } from "react";
import {
	ActivityIndicator,
	Pressable,
	RefreshControl,
	ScrollView,
	StyleSheet,
	Text,
	View,
} from "react-native";
import { Fonts } from "@/constants/theme";
import { EmptyState } from "@/src/components/EmptyState";
import {
	InlineNotice,
	LoadError,
	QueueSkeleton,
} from "@/src/components/moderation/ModerationKit";
import { ModerationScreen } from "@/src/components/moderation/ModerationScreen";
import { riskSignalLabel } from "@/src/components/moderation/riskLabels";
import {
	type ModerationPalette,
	type Translate,
	useModerationTheme,
} from "@/src/components/moderation/theme";
import { tonesOf } from "@/src/components/moderation/tones";
import { VerificationCard } from "@/src/components/moderation/VerificationCard";
import {
	useModerationSummary,
	usePendingListings,
	usePendingReports,
	useRiskFlags,
} from "@/src/hooks/useModeration";
import { useModerationDisputes } from "@/src/hooks/useModerationDisputes";
import { useVerificationQueue } from "@/src/hooks/useModerationVerification";
import { useResponsive } from "@/src/hooks/useResponsive";
import { resolveErrorMessage } from "@/src/lib/apiError";
import { useTranslation } from "@/src/lib/i18n";
import { capitalize, queueTabs } from "@/src/lib/moderationVerification";
import { resolveListingImageUrl } from "@/src/lib/resolveImageUrl";
import type {
	ListingDoc,
	ModerationVerificationQueueItem,
	ReportDoc,
	UserDoc,
} from "@/src/types/api";
import type { RiskFlagQueueItem } from "../../../api/src/types/riskModeration";

type QueueKey = "listings" | "reports" | "verification" | "risk";

function relativeAge(iso: string, t: Translate): string {
	const minutes = Math.max(
		0,
		Math.round((Date.now() - new Date(iso).getTime()) / 60000),
	);
	if (minutes < 1) return t("moderation.ageNow");
	if (minutes < 60) return t("moderation.ageMinutes", { count: minutes });
	const hours = Math.round(minutes / 60);
	if (hours < 24) return t("moderation.ageHours", { count: hours });
	return t("moderation.ageDays", { count: Math.round(hours / 24) });
}

/**
 * How long an item has waited, coloured once it is late: amber past a day,
 * red past three. The words stay, so colour is never the only signal.
 */
function waitingAge(
	iso: string,
	t: Translate,
	c: ModerationPalette,
): { text: string; color?: string } {
	const k = tonesOf(c);
	const hours = (Date.now() - new Date(iso).getTime()) / 3_600_000;
	return {
		text: relativeAge(iso, t),
		color: hours > 72 ? k.dangerText : hours > 24 ? k.warningText : undefined,
	};
}

function nameOf(value: UserDoc | string | null | undefined): string | null {
	if (!value || typeof value === "string") return null;
	return value.name || value.email || null;
}

function severityLabel(
	severity: RiskFlagQueueItem["severity"],
	t: Translate,
): string {
	return severity === "high"
		? t("moderation.riskHigh")
		: severity === "medium"
			? t("moderation.riskMedium")
			: t("moderation.riskLow");
}

const Separator = () => <View style={styles.separator} />;

export default function ModerationHubScreen() {
	const c = useModerationTheme();
	const k = tonesOf(c);
	const { t } = useTranslation();
	const { centeredContent } = useResponsive();
	const [queue, setQueue] = useState<QueueKey>("listings");
	const [refreshing, setRefreshing] = useState(false);

	const summary = useModerationSummary();
	const listings = usePendingListings();
	const reports = usePendingReports();
	const riskFlags = useRiskFlags();
	// Never gated on the verification feature flag: a review already in flight
	// must finish reviewing while intake is paused, so the hub only ever asks
	// for the fixed "to_review" queue and never reads the flag.
	const verifications = useVerificationQueue("to_review");
	// The summary has no dispute count; the queue is a short flat list, so
	// the hub counts it itself.
	const disputes = useModerationDisputes();
	const openDisputes = disputes.data?.length ?? 0;
	const overdueDisputes = (disputes.data ?? []).filter(
		(row) => row.overdue,
	).length;

	const active =
		queue === "listings"
			? listings
			: queue === "reports"
				? reports
				: queue === "verification"
					? verifications
					: riskFlags;

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
	// bounded list, never an infinite one — so only the other tabs ever load a
	// next page or show a footer spinner.
	const infiniteActive =
		queue === "listings"
			? listings
			: queue === "reports"
				? reports
				: queue === "risk"
					? riskFlags
					: null;

	const onRefresh = useCallback(async () => {
		setRefreshing(true);
		await Promise.all([
			active.refetch(),
			summary.refetch(),
			disputes.refetch(),
		]);
		setRefreshing(false);
	}, [active, summary, disputes]);

	const tabs = queueTabs(summary.data).map((tab) => ({
		...tab,
		label: t(`moderation.tab${capitalize(tab.key)}`),
	}));

	const contentStyle = {
		padding: 16,
		paddingBottom: 40,
		...(centeredContent ? centeredContent : null),
	};
	const refreshControl = (
		<RefreshControl
			refreshing={refreshing}
			onRefresh={onRefresh}
			tintColor={c.primary}
			colors={[k.primaryFill]}
		/>
	);
	const footer = infiniteActive?.isFetchingNextPage ? (
		<ActivityIndicator style={styles.footer} color={c.primary} />
	) : null;

	return (
		<ModerationScreen
			title={t("moderation.title")}
			subtitle={
				summary.data
					? t("moderation.pendingTotal", { count: summary.data.total })
					: undefined
			}
		>
			<Pressable
				accessibilityRole="button"
				accessibilityLabel={[
					t("moderation.disputesQueue"),
					openDisputes > 0 ? String(openDisputes) : null,
					overdueDisputes > 0
						? t("moderation.disputesOverdue", { count: overdueDisputes })
						: null,
				]
					.filter(Boolean)
					.join(", ")}
				onPress={() => router.push("/moderation/disputes")}
				style={({ pressed }) => [
					styles.disputesLink,
					{
						borderColor: c.border,
						backgroundColor: c.card,
						opacity: pressed ? 0.85 : 1,
					},
				]}
			>
				<View
					style={[styles.disputesIcon, { backgroundColor: k.selectedSoft }]}
				>
					<Ionicons name="scale-outline" size={20} color={k.linkText} />
				</View>
				<View style={styles.disputesBody}>
					<Text style={[styles.disputesLabel, { color: c.text }]}>
						{t("moderation.disputesQueue")}
					</Text>
					{overdueDisputes > 0 ? (
						<Text style={[styles.disputesLate, { color: k.dangerText }]}>
							{t("moderation.disputesOverdue", { count: overdueDisputes })}
						</Text>
					) : null}
				</View>
				{openDisputes > 0 ? (
					<View
						style={[
							styles.tabBadge,
							{
								backgroundColor:
									overdueDisputes > 0 ? k.dangerFill : k.primaryFill,
							},
						]}
					>
						<Text style={[styles.tabBadgeText, { color: k.onFill }]}>
							{openDisputes}
						</Text>
					</View>
				) : null}
				<Ionicons name="chevron-forward" size={18} color={c.muted} />
			</Pressable>

			{/* Scrollable tabs: four labels and their counts do not fit a
			    small phone at a readable size, and truncating "Signalements"
			    hides which queue is which. */}
			<View style={[styles.tabsWrap, { borderBottomColor: c.border }]}>
				<ScrollView
					horizontal
					showsHorizontalScrollIndicator={false}
					contentContainerStyle={styles.tabs}
					accessibilityRole="tablist"
				>
					{tabs.map((tab) => {
						const selected = queue === tab.key;
						const count =
							typeof tab.count === "number" && tab.count > 0 ? tab.count : null;
						return (
							<Pressable
								key={tab.key}
								accessibilityRole="tab"
								accessibilityState={{ selected }}
								accessibilityLabel={
									count ? `${tab.label}, ${count}` : tab.label
								}
								onPress={() => setQueue(tab.key)}
								style={[
									styles.tab,
									{
										borderBottomColor: selected ? k.linkText : "transparent",
									},
								]}
							>
								<Text
									style={[
										styles.tabLabel,
										{
											color: selected ? k.linkText : c.muted,
											fontFamily: selected
												? Fonts.bodyBold
												: Fonts.bodySemibold,
										},
									]}
								>
									{tab.label}
								</Text>
								{count ? (
									<View
										style={[
											styles.tabBadge,
											{
												backgroundColor: selected
													? k.primaryFill
													: k.disabledFill,
											},
										]}
									>
										<Text
											style={[
												styles.tabBadgeText,
												{ color: selected ? k.onFill : c.text },
											]}
										>
											{count}
										</Text>
									</View>
								) : null}
							</Pressable>
						);
					})}
				</ScrollView>
			</View>

			{active.isLoading ? (
				<QueueSkeleton />
			) : active.isError && !active.data ? (
				<LoadError
					title={
						queue === "risk"
							? t("moderation.riskQueueFailed")
							: t("common.error")
					}
					message={resolveErrorMessage(active.error, t)}
					error={active.error}
					onRetry={() => void active.refetch()}
				/>
			) : (
				<>
					{/* A failed background refresh over cached rows: say so, or the
					    moderator works a stale queue and every decision 409s. */}
					{active.isError ? (
						<Pressable
							accessibilityRole="button"
							accessibilityHint={t("common.retry")}
							onPress={() => void active.refetch()}
							style={styles.staleNotice}
						>
							<InlineNotice tone="warning" text={t("moderation.queueStale")} />
						</Pressable>
					) : null}
					{queue === "risk" ? (
						<FlashList
							data={(riskFlags.data?.pages ?? []).flatMap((page) => page.items)}
							keyExtractor={(item) => item.id}
							contentContainerStyle={contentStyle}
							ItemSeparatorComponent={Separator}
							refreshControl={refreshControl}
							onEndReached={() => {
								if (riskFlags.hasNextPage && !riskFlags.isFetchingNextPage) {
									void riskFlags.fetchNextPage();
								}
							}}
							onEndReachedThreshold={0.4}
							ListEmptyComponent={
								<EmptyState
									illustration="empty"
									title={t("moderation.emptyRiskTitle")}
									subtitle={t("moderation.emptySubtitle")}
								/>
							}
							ListFooterComponent={footer}
							renderItem={({ item }) => <RiskFlagRow flag={item} t={t} c={c} />}
						/>
					) : (
						<FlashList
							data={items}
							keyExtractor={(item) => item.id}
							getItemType={() => queue}
							contentContainerStyle={contentStyle}
							ItemSeparatorComponent={Separator}
							refreshControl={refreshControl}
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
							ListFooterComponent={footer}
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
				</>
			)}
		</ModerationScreen>
	);
}

/** One queue row: a leading tile, two lines of text, a chevron. */
function QueueRow({
	label,
	onPress,
	leading,
	title,
	meta,
	age,
	titleLines = 1,
	c,
}: {
	label: string;
	onPress: () => void;
	leading: ReactNode;
	title: string;
	meta: string;
	/** The waiting time, appended to the meta line in its own colour. */
	age?: { text: string; color?: string };
	titleLines?: number;
	c: ModerationPalette;
}) {
	return (
		<Pressable
			accessibilityRole="button"
			accessibilityLabel={label}
			onPress={onPress}
			style={({ pressed }) => [
				styles.card,
				{
					backgroundColor: c.card,
					borderColor: c.border,
					opacity: pressed ? 0.85 : 1,
				},
			]}
		>
			{leading}
			<View style={styles.cardBody}>
				<Text
					style={[styles.cardTitle, { color: c.text }]}
					numberOfLines={titleLines}
				>
					{title}
				</Text>
				<Text style={[styles.cardMeta, { color: c.muted }]} numberOfLines={2}>
					{meta}
					{age ? (
						<Text
							style={
								age.color
									? { color: age.color, fontFamily: Fonts.bodySemibold }
									: null
							}
						>
							{meta ? ` · ${age.text}` : age.text}
						</Text>
					) : null}
				</Text>
			</View>
			<Ionicons name="chevron-forward" size={18} color={c.muted} />
		</Pressable>
	);
}

function RiskFlagRow({
	flag,
	t,
	c,
}: {
	flag: RiskFlagQueueItem;
	t: Translate;
	c: ModerationPalette;
}) {
	const k = tonesOf(c);
	const high = flag.severity === "high";
	const medium = flag.severity === "medium";
	const title = flag.subjectLabel ?? t("moderation.riskUnknownSubject");
	const severity = severityLabel(flag.severity, t);
	const signal = riskSignalLabel(flag.signal, t);
	const score = t("moderation.riskScore", { score: flag.score });
	return (
		<QueueRow
			label={`${title}, ${severity}, ${score}, ${signal}`}
			onPress={() => router.push(`/moderation/risk/${flag.id}`)}
			c={c}
			title={title}
			meta={`${severity} · ${signal} · ${t("moderation.riskOccurrences", {
				count: flag.occurrences ?? 1,
			})} · ${relativeAge(flag.lastSeenAt, t)}`}
			leading={
				<View
					style={[
						styles.tile,
						{
							backgroundColor: high
								? c.dangerSoft
								: medium
									? c.warningSoft
									: k.selectedSoft,
						},
					]}
				>
					<Text
						style={[
							styles.riskScore,
							{
								color: high
									? k.dangerText
									: medium
										? k.warningText
										: k.linkText,
							},
						]}
					>
						{flag.score}
					</Text>
					<Text style={[styles.riskScale, { color: c.muted }]}>/100</Text>
				</View>
			}
		/>
	);
}

function ListingRow({
	listing,
	t,
	c,
}: {
	listing: ListingDoc;
	t: Translate;
	c: ModerationPalette;
}) {
	const thumb = resolveListingImageUrl(listing.images?.[0], "thumbnail");
	const seller = nameOf(listing.seller);

	return (
		<QueueRow
			label={listing.title}
			onPress={() => router.push(`/moderation/listing/${listing.id}` as never)}
			c={c}
			title={listing.title}
			titleLines={2}
			meta={seller ?? ""}
			age={waitingAge(listing.createdAt, t, c)}
			leading={
				thumb ? (
					<Image
						source={{ uri: thumb }}
						style={[styles.thumb, { backgroundColor: c.bg }]}
						contentFit="cover"
						transition={150}
						recyclingKey={listing.id}
					/>
				) : (
					<View
						style={[styles.thumb, styles.center, { backgroundColor: c.bg }]}
					>
						<Ionicons name="image-outline" size={22} color={c.muted} />
					</View>
				)
			}
		/>
	);
}

function ReportRow({
	report,
	t,
	c,
}: {
	report: ReportDoc;
	t: Translate;
	c: ModerationPalette;
}) {
	const k = tonesOf(c);
	const reporter = nameOf(report.reporter);
	const title = t(`report.${report.reason}`);

	return (
		<QueueRow
			label={title}
			onPress={() => router.push(`/moderation/report/${report.id}` as never)}
			c={c}
			title={title}
			meta={[t(`moderation.target_${report.targetType}`), reporter]
				.filter(Boolean)
				.join(" · ")}
			age={waitingAge(report.createdAt, t, c)}
			leading={
				<View style={[styles.tile, { backgroundColor: c.dangerSoft }]}>
					<Ionicons name="flag" size={18} color={k.dangerText} />
				</View>
			}
		/>
	);
}

const styles = StyleSheet.create({
	separator: { height: 10 },
	footer: { margin: 16 },
	disputesLink: {
		flexDirection: "row",
		alignItems: "center",
		gap: 12,
		minHeight: 60,
		borderRadius: 14,
		borderWidth: StyleSheet.hairlineWidth,
		marginHorizontal: 16,
		marginTop: 12,
		marginBottom: 4,
		paddingHorizontal: 12,
		paddingVertical: 10,
	},
	disputesIcon: {
		width: 40,
		height: 40,
		borderRadius: 10,
		alignItems: "center",
		justifyContent: "center",
	},
	disputesBody: { flex: 1, gap: 1 },
	disputesLabel: {
		fontSize: 15,
		lineHeight: 20,
		fontFamily: Fonts.bodySemibold,
	},
	disputesLate: {
		fontSize: 13,
		lineHeight: 18,
		fontFamily: Fonts.bodySemibold,
	},
	staleNotice: { marginHorizontal: 16, marginTop: 12 },
	tabsWrap: { borderBottomWidth: StyleSheet.hairlineWidth },
	tabs: { paddingHorizontal: 8 },
	tab: {
		flexDirection: "row",
		alignItems: "center",
		gap: 6,
		minHeight: 48,
		paddingHorizontal: 12,
		borderBottomWidth: 2.5,
	},
	tabLabel: { fontFamily: Fonts.body, fontSize: 15, lineHeight: 20 },
	tabBadge: {
		minWidth: 22,
		height: 22,
		paddingHorizontal: 6,
		borderRadius: 11,
		alignItems: "center",
		justifyContent: "center",
	},
	tabBadgeText: { fontSize: 12, lineHeight: 16, fontFamily: Fonts.displayBold },
	card: {
		flexDirection: "row",
		alignItems: "center",
		gap: 12,
		minHeight: 72,
		borderRadius: 14,
		borderWidth: StyleSheet.hairlineWidth,
		padding: 12,
	},
	thumb: { width: 56, height: 56, borderRadius: 10 },
	center: { alignItems: "center", justifyContent: "center" },
	tile: {
		width: 44,
		height: 44,
		borderRadius: 10,
		alignItems: "center",
		justifyContent: "center",
	},
	riskScore: {
		fontSize: 16,
		lineHeight: 19,
		fontFamily: Fonts.displayExtrabold,
	},
	riskScale: { fontSize: 12, lineHeight: 14, fontFamily: Fonts.bodyMedium },
	cardBody: { flex: 1, gap: 3 },
	cardTitle: { fontSize: 15, lineHeight: 20, fontFamily: Fonts.bodySemibold },
	cardMeta: { fontSize: 13, lineHeight: 18, fontFamily: Fonts.body },
});
