import { FlashList } from "@shopify/flash-list";
import { router } from "expo-router";
import {
	ActivityIndicator,
	Pressable,
	StyleSheet,
	Text,
	View,
} from "react-native";
import { Fonts } from "@/constants/theme";
import { EmptyState } from "@/src/components/EmptyState";
import { ModerationScreen } from "@/src/components/moderation/ModerationScreen";
import { useModerationTheme } from "@/src/components/moderation/theme";
import { useModerationDisputes } from "@/src/hooks/useModerationDisputes";
import { useTranslation } from "@/src/lib/i18n";

export default function ModerationDisputesQueueScreen() {
	const c = useModerationTheme();
	const { t } = useTranslation();
	const query = useModerationDisputes();
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
				<FlashList
					data={query.data ?? []}
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
							onPress={() =>
								router.push({
									pathname: "/moderation/disputes/[id]",
									params: { id: item.id },
								})
							}
							style={[
								styles.card,
								{ backgroundColor: c.card, borderColor: c.border },
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
								{t(`disputes.status.${item.status}`)}
							</Text>
							<Text style={[styles.body, { color: c.muted }]}>
								{t(`disputes.reason.${item.reason}`)} ·{" "}
								{item.amountAtStake.toLocaleString()} XAF
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
