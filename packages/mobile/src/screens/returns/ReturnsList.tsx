import { FlashList } from "@shopify/flash-list";
import { router } from "expo-router";
import {
	ActivityIndicator,
	Pressable,
	StyleSheet,
	Text,
	View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Fonts } from "@/constants/theme";
import { useColorScheme } from "@/hooks/use-color-scheme";
import { EmptyState } from "@/src/components/EmptyState";
import { HeaderBackButton } from "@/src/components/layout/HeaderBackButton";
import { ScreenColumn } from "@/src/components/layout/ScreenColumn";
import type { SplitListProps } from "@/src/components/layout/SplitScreen";
import { useSelectedRowStyle } from "@/src/components/layout/selectedRow";
import { useBuyerReturns } from "@/src/hooks/useReturns";
import {
	RETURN_BASIS_LABELS,
	RETURN_CASE_STATUS_LABELS,
} from "@/src/lib/caseStatus";
import { useTranslation } from "@/src/lib/i18n";
import { formatPrice } from "@/src/lib/market";
import type { ReturnListRow } from "../../../../api/src/contracts/returns";

export function ReturnsList({ selectedId, onOpen }: SplitListProps) {
	const dark = useColorScheme() === "dark";
	const { t, i18n } = useTranslation();
	const query = useBuyerReturns();
	const colors = {
		bg: dark ? "#0c1030" : "#f4f5f9",
		text: dark ? "#e1e3ee" : "#12163a",
		muted: dark ? "#a3a7c8" : "#5b6088",
		border: dark ? "#2a3170" : "#e1e3ee",
		primary: dark ? "#9aa8f5" : "#23338f",
	};
	return (
		<SafeAreaView
			edges={["top"]}
			style={[styles.safe, { backgroundColor: colors.bg }]}
		>
			<View style={[styles.header, { borderBottomColor: colors.border }]}>
				<HeaderBackButton
					color={colors.text}
					fallback="/(tabs)/account"
					inline
				/>
				<Text style={[styles.title, { color: colors.text }]}>
					{t("returns.title")}
				</Text>
				<View style={styles.spacer} />
			</View>
			{query.isPending ? (
				<ActivityIndicator style={styles.loading} color={colors.primary} />
			) : null}
			{query.isError ? (
				<EmptyState
					illustration="notFound"
					title={t("returns.loadError")}
					ctaLabel={t("common.retry")}
					onCta={() => void query.refetch()}
				/>
			) : null}
			{query.data?.rows.length === 0 ? (
				<EmptyState
					illustration="empty"
					title={t("returns.emptyTitle")}
					subtitle={t("returns.emptyBody")}
					ctaLabel={t("disputes.viewPurchases")}
					onCta={() => router.push("/purchases")}
				/>
			) : null}
			{query.data?.rows.length ? (
				<ScreenColumn width="wide">
					<FlashList
						data={query.data.rows}
						extraData={selectedId}
						keyExtractor={(row) => row.id}
						contentContainerStyle={styles.list}
						ItemSeparatorComponent={() => <View style={{ height: 10 }} />}
						renderItem={({ item }) => (
							<ReturnRow
								item={item}
								dark={dark}
								locale={i18n.language}
								selected={item.id === selectedId}
								onPress={() => onOpen(item.id)}
							/>
						)}
					/>
				</ScreenColumn>
			) : null}
		</SafeAreaView>
	);
}

function ReturnRow({
	item,
	dark,
	locale,
	onPress,
	selected,
}: {
	item: ReturnListRow;
	dark: boolean;
	locale: string;
	onPress: () => void;
	/** Open in the detail pane beside the list. */
	selected?: boolean;
}) {
	const { t } = useTranslation();
	const selectedStyle = useSelectedRowStyle()(selected);
	return (
		<Pressable
			accessibilityRole="button"
			onPress={onPress}
			accessibilityState={{ selected: Boolean(selected) }}
			style={[
				styles.card,
				{
					backgroundColor: dark ? "#11163a" : "#fff",
					borderColor: dark ? "#2a3170" : "#e1e3ee",
				},
				selectedStyle,
			]}
		>
			<View style={styles.row}>
				<Text style={[styles.number, { color: dark ? "#e1e3ee" : "#12163a" }]}>
					{item.number}
				</Text>
				{item.overdue ? (
					<Text style={styles.overdue}>{t("returns.overdue")}</Text>
				) : null}
			</View>
			<Text style={[styles.body, { color: dark ? "#a3a7c8" : "#5b6088" }]}>
				{t("returns.order", { number: item.orderNumber })} ·{" "}
				{t(RETURN_BASIS_LABELS[item.basis])}
			</Text>
			<Text style={[styles.body, { color: dark ? "#a3a7c8" : "#5b6088" }]}>
				{t(RETURN_CASE_STATUS_LABELS[item.status])} ·{" "}
				{t("returns.refundAmount", {
					amount: formatPrice(item.refundAmount, locale),
				})}
			</Text>
			{item.nextDeadline ? (
				<Text style={[styles.body, { color: dark ? "#a3a7c8" : "#5b6088" }]}>
					{t("returns.deadline", {
						date: new Date(item.nextDeadline).toLocaleDateString(locale),
					})}
				</Text>
			) : null}
		</Pressable>
	);
}

const styles = StyleSheet.create({
	safe: { flex: 1 },
	header: {
		alignItems: "center",
		borderBottomWidth: StyleSheet.hairlineWidth,
		flexDirection: "row",
		gap: 16,
		paddingHorizontal: 18,
		paddingVertical: 14,
	},
	title: { flex: 1, fontFamily: Fonts.displaySemibold, fontSize: 19 },
	spacer: { width: 22 },
	loading: { marginTop: 40 },
	list: { padding: 16 },
	card: { borderRadius: 14, borderWidth: 1, gap: 7, padding: 15 },
	row: {
		alignItems: "center",
		flexDirection: "row",
		justifyContent: "space-between",
	},
	number: { fontFamily: Fonts.displaySemibold, fontSize: 16 },
	body: { fontFamily: Fonts.body, fontSize: 13 },
	overdue: { color: "#d23a2e", fontFamily: Fonts.bodySemibold, fontSize: 12 },
});
