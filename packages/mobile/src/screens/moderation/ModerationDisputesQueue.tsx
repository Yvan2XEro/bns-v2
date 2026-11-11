import { Ionicons } from "@expo/vector-icons";
import { FlashList } from "@shopify/flash-list";
import { Pressable, StyleSheet, Text, View } from "react-native";
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
import {
	DISPUTE_REASON_LABELS,
	DISPUTE_STATUS_LABELS,
} from "@/src/lib/caseStatus";
import i18n, { useTranslation } from "@/src/lib/i18n";
import { formatPrice } from "@/src/lib/market";

const Separator = () => <View style={styles.separator} />;

export function ModerationDisputesQueue({
	selectedId,
	onOpen,
}: SplitListProps) {
	const c = useModerationTheme();
	const k = tonesOf(c);
	const { t } = useTranslation();
	const query = useModerationDisputes();
	const selectedStyle = useSelectedRowStyle();
	const sun = c.isDark ? Colors.dark.sun : Colors.light.sun;
	return (
		<ModerationScreen title={t("moderationDisputes.title")}>
			{query.isPending ? (
				<QueueSkeleton />
			) : query.isError ? (
				<LoadError
					title={t("moderationDisputes.loadError")}
					message={resolveErrorMessage(query.error, t)}
					onRetry={() => void query.refetch()}
				/>
			) : (
				<ScreenColumn width="wide">
					<FlashList
						data={query.data ?? []}
						extraData={selectedId}
						keyExtractor={(item) => item.id}
						contentContainerStyle={styles.list}
						ItemSeparatorComponent={Separator}
						refreshing={query.isRefetching}
						onRefresh={() => void query.refetch()}
						ListEmptyComponent={
							<EmptyState
								illustration="empty"
								title={t("moderationDisputes.empty")}
							/>
						}
						renderItem={({ item }) => (
							<Pressable
								accessibilityRole="button"
								accessibilityLabel={t("moderationDisputes.openCase", {
									number: item.number,
								})}
								accessibilityState={{ selected: item.id === selectedId }}
								onPress={() => onOpen(item.id)}
								style={({ pressed }) => [
									styles.card,
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
									{t(DISPUTE_STATUS_LABELS[item.status])}
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
											{t("moderationDisputes.deadline", {
												date: new Date(item.deadline).toLocaleString(),
											})}
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
	card: { borderWidth: 1, borderRadius: 14, padding: 14, gap: 6 },
	row: {
		flexDirection: "row",
		alignItems: "center",
		gap: 8,
		marginBottom: 2,
	},
	number: { fontFamily: Fonts.displayBold, fontSize: 17, lineHeight: 22 },
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
