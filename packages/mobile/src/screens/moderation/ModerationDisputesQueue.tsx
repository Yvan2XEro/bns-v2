import { Ionicons } from "@expo/vector-icons";
import { FlashList } from "@shopify/flash-list";
import { useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { Colors, Fonts } from "@/constants/theme";
import { EmptyState } from "@/src/components/EmptyState";
import { ScreenColumn } from "@/src/components/layout/ScreenColumn";
import type { SplitListProps } from "@/src/components/layout/SplitScreen";
import { useSelectedRowStyle } from "@/src/components/layout/selectedRow";
import {
	LoadError,
	QueueSkeleton,
	TonePill,
} from "@/src/components/moderation/ModerationKit";
import { ModerationScreen } from "@/src/components/moderation/ModerationScreen";
import { useModerationTheme } from "@/src/components/moderation/theme";
import { tonesOf } from "@/src/components/moderation/tones";
import { useModerationDisputes } from "@/src/hooks/useModerationDisputes";
import { resolveErrorMessage } from "@/src/lib/apiError";
import { useAuth } from "@/src/lib/auth";
import {
	DISPUTE_REASON_LABELS,
	DISPUTE_STATUS_LABELS,
} from "@/src/lib/caseStatus";
import { formatDate } from "@/src/lib/formatDate";
import i18n, { useTranslation } from "@/src/lib/i18n";
import { formatPrice } from "@/src/lib/market";

const Separator = () => <View style={styles.separator} />;

type Filter = "all" | "mine" | "overdue";
const FILTERS: Filter[] = ["all", "mine", "overdue"];
const FILTER_LABEL: Record<Filter, string> = {
	all: "moderationDisputes.filterAll",
	mine: "moderationDisputes.filterMine",
	overdue: "moderationDisputes.filterOverdue",
};

type Translate = (key: string, options?: Record<string, unknown>) => string;

/**
 * "dans 3 h", "en retard de 2 h": triage reads a distance, not a date. The
 * absolute date stays in the row's accessibility label.
 */
function relativeDeadline(iso: string, t: Translate): string {
	const diff = new Date(iso).getTime() - Date.now();
	const late = diff < 0;
	const minutes = Math.max(1, Math.round(Math.abs(diff) / 60000));
	const hours = Math.round(minutes / 60);
	const days = Math.round(hours / 24);
	const [unit, count] =
		minutes < 60
			? (["Minutes", minutes] as const)
			: hours < 48
				? (["Hours", hours] as const)
				: (["Days", days] as const);
	return late
		? t(`moderationDisputes.late${unit}`, { count })
		: t(`moderationDisputes.dueIn${unit}`, { count });
}

export function ModerationDisputesQueue({
	selectedId,
	onOpen,
}: SplitListProps) {
	const c = useModerationTheme();
	const k = tonesOf(c);
	const { t } = useTranslation();
	const { user } = useAuth();
	const query = useModerationDisputes();
	const selectedStyle = useSelectedRowStyle();
	const sun = c.isDark ? Colors.dark.sun : Colors.light.sun;
	const [filter, setFilter] = useState<Filter>("all");
	const rows = (query.data ?? []).filter((row) =>
		filter === "mine"
			? Boolean(user?.id) && row.assignedTo === user?.id
			: filter === "overdue"
				? row.overdue
				: true,
	);
	const ownerLabel = (assignedTo: string | null) =>
		!assignedTo
			? t("moderationDisputes.unassigned")
			: assignedTo === user?.id
				? t("moderationDisputes.assignedToYou")
				: t("moderationDisputes.assignedToOther");
	return (
		<ModerationScreen title={t("moderationDisputes.title")}>
			{query.isPending ? (
				<QueueSkeleton />
			) : query.isError ? (
				<LoadError
					title={t("moderationDisputes.loadError")}
					message={resolveErrorMessage(query.error, t)}
					error={query.error}
					onRetry={() => void query.refetch()}
				/>
			) : (
				<ScreenColumn width="wide">
					<ScrollView
						horizontal
						showsHorizontalScrollIndicator={false}
						contentContainerStyle={styles.filters}
						style={styles.filtersBar}
					>
						{FILTERS.map((value) => {
							const on = filter === value;
							return (
								<Pressable
									key={value}
									accessibilityRole="button"
									accessibilityState={{ selected: on }}
									onPress={() => setFilter(value)}
									style={[
										styles.filter,
										{
											borderColor: on ? k.linkText : c.border,
											backgroundColor: on ? k.selectedSoft : c.card,
										},
									]}
								>
									<Text
										style={[
											styles.filterText,
											{
												color: on ? k.linkText : c.text,
												fontFamily: on ? Fonts.bodySemibold : Fonts.body,
											},
										]}
									>
										{t(FILTER_LABEL[value])}
									</Text>
								</Pressable>
							);
						})}
					</ScrollView>
					<FlashList
						data={rows}
						extraData={`${selectedId ?? ""}|${filter}`}
						keyExtractor={(item) => item.id}
						contentContainerStyle={styles.list}
						ItemSeparatorComponent={Separator}
						refreshing={query.isRefetching}
						onRefresh={() => void query.refetch()}
						ListEmptyComponent={
							<EmptyState
								illustration="empty"
								title={t("moderationDisputes.empty")}
								subtitle={t("moderation.emptySubtitle")}
							/>
						}
						renderItem={({ item }) => (
							<Pressable
								accessibilityRole="button"
								// The whole row in one phrase, in the order it is triaged:
								// overdue first, then what is at stake and why.
								accessibilityLabel={[
									t("moderationDisputes.openCase", { number: item.number }),
									item.overdue ? t("moderationDisputes.overdue") : null,
									formatPrice(item.amountAtStake, i18n.language),
									t(DISPUTE_REASON_LABELS[item.reason]),
									t(DISPUTE_STATUS_LABELS[item.status]),
									ownerLabel(item.assignedTo),
									item.deadline
										? t("moderationDisputes.deadline", {
												date: formatDate(item.deadline, {
													day: "numeric",
													month: "short",
													hour: "2-digit",
													minute: "2-digit",
												}),
											})
										: null,
								]
									.filter(Boolean)
									.join(", ")}
								accessibilityState={{ selected: item.id === selectedId }}
								onPress={() => onOpen(item.id)}
								style={({ pressed }) => [
									styles.card,
									// A late case is outlined in full, never striped: the
									// pill and the red deadline carry the rest.
									item.overdue && styles.cardOverdue,
									{
										backgroundColor: c.card,
										borderColor: item.overdue ? k.dangerText : c.border,
										opacity: pressed ? 0.85 : 1,
									},
									selectedStyle(item.id === selectedId),
								]}
							>
								<View style={styles.row}>
									<Text style={[styles.number, { color: c.text }]}>
										{item.number}
									</Text>
									{item.overdue ? (
										<TonePill
											tone="negative"
											label={t("moderationDisputes.overdue")}
										/>
									) : null}
									<View style={styles.flex} />
									{/* The amount at stake is a price: ink on the yellow tag. */}
									<View style={[styles.priceTag, { backgroundColor: sun }]}>
										<Text style={styles.priceText}>
											{formatPrice(item.amountAtStake, i18n.language)}
										</Text>
									</View>
								</View>
								<Text style={[styles.body, { color: c.text }]}>
									{t(DISPUTE_REASON_LABELS[item.reason])}
								</Text>
								<Text style={[styles.meta, { color: c.muted }]}>
									{t("disputes.order", { number: item.orderNumber })} ·{" "}
									{t(DISPUTE_STATUS_LABELS[item.status])} ·{" "}
									{ownerLabel(item.assignedTo)}
								</Text>
								{item.deadline ? (
									<View style={styles.deadline}>
										<Ionicons
											name="time-outline"
											size={15}
											color={item.overdue ? k.dangerText : c.muted}
										/>
										<Text
											style={[
												styles.meta,
												{
													color: item.overdue ? k.dangerText : c.muted,
													fontFamily: item.overdue
														? Fonts.bodySemibold
														: Fonts.body,
												},
											]}
										>
											{relativeDeadline(item.deadline, t)}
										</Text>
									</View>
								) : null}
							</Pressable>
						)}
					/>
				</ScreenColumn>
			)}
		</ModerationScreen>
	);
}

const styles = StyleSheet.create({
	flex: { flex: 1 },
	separator: { height: 10 },
	list: { padding: 16, paddingBottom: 32 },
	filtersBar: { flexGrow: 0 },
	filters: { gap: 8, paddingHorizontal: 16, paddingTop: 12 },
	filter: {
		minHeight: 44,
		justifyContent: "center",
		borderRadius: 20,
		borderWidth: 1.5,
		paddingHorizontal: 14,
	},
	filterText: { fontFamily: Fonts.body, fontSize: 15, lineHeight: 22 },
	card: {
		borderWidth: StyleSheet.hairlineWidth,
		borderRadius: 14,
		padding: 14,
		gap: 6,
	},
	cardOverdue: { borderWidth: 1.5 },
	row: {
		flexDirection: "row",
		alignItems: "center",
		gap: 8,
		marginBottom: 2,
	},
	number: { fontFamily: Fonts.displayBold, fontSize: 18, lineHeight: 26 },
	priceTag: { borderRadius: 6, paddingHorizontal: 8, paddingVertical: 2 },
	priceText: {
		color: Colors.light.sunForeground,
		fontFamily: Fonts.displayExtrabold,
		fontSize: 15,
		lineHeight: 19,
	},
	body: { fontFamily: Fonts.bodySemibold, fontSize: 15, lineHeight: 21 },
	meta: { fontFamily: Fonts.body, fontSize: 13, lineHeight: 18 },
	deadline: { flexDirection: "row", alignItems: "center", gap: 6 },
});
