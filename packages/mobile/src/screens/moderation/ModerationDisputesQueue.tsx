import { FlashList } from "@shopify/flash-list";
import {
	ActivityIndicator,
	Pressable,
	StyleSheet,
	Text,
	View,
} from "react-native";
import { Fonts } from "@/constants/theme";
import { EmptyState } from "@/src/components/EmptyState";
import { ScreenColumn } from "@/src/components/layout/ScreenColumn";
import type { SplitListProps } from "@/src/components/layout/SplitScreen";
import { useSelectedRowStyle } from "@/src/components/layout/selectedRow";
import { ModerationScreen } from "@/src/components/moderation/ModerationScreen";
import { useModerationTheme } from "@/src/components/moderation/theme";
import { useModerationDisputes } from "@/src/hooks/useModerationDisputes";
import {
	DISPUTE_REASON_LABELS,
	DISPUTE_STATUS_LABELS,
} from "@/src/lib/caseStatus";
import i18n, { useTranslation } from "@/src/lib/i18n";
import { formatPrice } from "@/src/lib/market";

export function ModerationDisputesQueue({
	selectedId,
	onOpen,
}: SplitListProps) {
	const c = useModerationTheme();
	const { t } = useTranslation();
	const query = useModerationDisputes();
	const selectedStyle = useSelectedRowStyle();
	return (
		<ModerationScreen title={t("moderationDisputes.title")}>
			{query.isPending ? (
				<ActivityIndicator style={styles.loading} color={c.primary} />
			) : query.isError ? (
				<EmptyState
					illustration="notFound"
					title={t("moderationDisputes.loadError")}
					ctaLabel={t("common.retry")}
					onCta={() => void query.refetch()}
				/>
			) : (
				<ScreenColumn width="wide">
					<FlashList
						data={query.data ?? []}
						extraData={selectedId}
						keyExtractor={(item) => item.id}
						contentContainerStyle={styles.list}
						ItemSeparatorComponent={() => <View style={{ height: 10 }} />}
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
								style={[
									styles.card,
									{ backgroundColor: c.card, borderColor: c.border },
									selectedStyle(item.id === selectedId),
								]}
							>
								<View style={styles.row}>
									<Text style={[styles.number, { color: c.text }]}>
										{item.number}
									</Text>
									{item.overdue ? (
										<Text style={[styles.overdue, { color: c.danger }]}>
											{t("moderationDisputes.overdue")}
										</Text>
									) : null}
								</View>
								<Text style={[styles.body, { color: c.muted }]}>
									{t("disputes.order", { number: item.orderNumber })} ·{" "}
									{t(DISPUTE_STATUS_LABELS[item.status])}
								</Text>
								<Text style={[styles.body, { color: c.muted }]}>
									{t(DISPUTE_REASON_LABELS[item.reason])} ·{" "}
									{formatPrice(item.amountAtStake, i18n.language)}
								</Text>
								{item.deadline ? (
									<Text
										style={[
											styles.body,
											{ color: item.overdue ? c.danger : c.muted },
										]}
									>
										{t("moderationDisputes.deadline", {
											date: new Date(item.deadline).toLocaleString(),
										})}
									</Text>
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
	loading: { marginTop: 40 },
	list: { padding: 16, paddingBottom: 32 },
	card: { borderWidth: 1, borderRadius: 14, padding: 15, gap: 7 },
	row: {
		flexDirection: "row",
		justifyContent: "space-between",
		alignItems: "center",
	},
	number: { fontFamily: Fonts.displaySemibold, fontSize: 16 },
	overdue: { fontFamily: Fonts.bodySemibold, fontSize: 12 },
	body: { fontFamily: Fonts.body, fontSize: 13, lineHeight: 19 },
});
