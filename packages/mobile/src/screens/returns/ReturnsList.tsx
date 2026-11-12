import { Ionicons } from "@expo/vector-icons";
import { FlashList } from "@shopify/flash-list";
import { router } from "expo-router";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Fonts } from "@/constants/theme";
import {
	CaseStatusPill,
	returnTone,
} from "@/src/components/checkout/CaseStatusPill";
import { OrderListSkeleton } from "@/src/components/checkout/OrderListSkeleton";
import { EmptyState } from "@/src/components/EmptyState";
import { ScreenColumn } from "@/src/components/layout/ScreenColumn";
import type { SplitListProps } from "@/src/components/layout/SplitScreen";
import { useSelectedRowStyle } from "@/src/components/layout/selectedRow";
import { SellerHeader } from "@/src/components/shop/SellerHeader";
import { useShopTheme } from "@/src/components/shop/theme";
import { useBuyerReturns } from "@/src/hooks/useReturns";
import {
	RETURN_BASIS_LABELS,
	RETURN_CASE_STATUS_LABELS,
} from "@/src/lib/caseStatus";
import { useTranslation } from "@/src/lib/i18n";
import { formatPrice } from "@/src/lib/market";
import type { ReturnListRow } from "../../../../api/src/contracts/returns";

export function ReturnsList({ selectedId, onOpen }: SplitListProps) {
	const c = useShopTheme();
	const { t, i18n } = useTranslation();
	const query = useBuyerReturns();
	return (
		<SafeAreaView
			edges={["top"]}
			style={[styles.safe, { backgroundColor: c.bg }]}
		>
			<SellerHeader title={t("returns.title")} />
			{query.isPending ? <OrderListSkeleton /> : null}
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
						ItemSeparatorComponent={Separator}
						renderItem={({ item }) => (
							<ReturnRow
								item={item}
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

function Separator() {
	return <View style={styles.separator} />;
}

function ReturnRow({
	item,
	locale,
	onPress,
	selected,
}: {
	item: ReturnListRow;
	locale: string;
	onPress: () => void;
	/** Open in the detail pane beside the list. */
	selected?: boolean;
}) {
	const c = useShopTheme();
	const { t } = useTranslation();
	const selectedStyle = useSelectedRowStyle()(selected);
	const status = t(RETURN_CASE_STATUS_LABELS[item.status]);
	const amount = formatPrice(item.refundAmount, locale);
	return (
		<Pressable
			accessibilityRole="button"
			accessibilityLabel={`${item.number}, ${status}, ${t("returns.refundAmount", { amount })}`}
			onPress={onPress}
			accessibilityState={{ selected: Boolean(selected) }}
			style={({ pressed }) => [
				styles.card,
				{ backgroundColor: c.card, borderColor: c.border },
				selectedStyle,
				pressed && styles.pressed,
			]}
		>
			<View style={styles.row}>
				<Text style={[styles.number, { color: c.text }]} numberOfLines={1}>
					{item.number}
				</Text>
				<CaseStatusPill label={status} tone={returnTone(item.status)} />
			</View>
			<Text style={[styles.body, { color: c.body }]}>
				{t("returns.order", { number: item.orderNumber })} ·{" "}
				{t(RETURN_BASIS_LABELS[item.basis])}
			</Text>
			<Text style={[styles.amount, { color: c.text }]}>
				{t("returns.refundAmount", { amount })}
			</Text>
			{item.overdue || item.nextDeadline ? (
				<View style={styles.deadline}>
					<Ionicons
						name={item.overdue ? "alert-circle" : "time-outline"}
						size={15}
						color={item.overdue ? c.dangerText : c.muted}
					/>
					<Text
						style={[
							styles.meta,
							{ color: item.overdue ? c.dangerText : c.muted },
						]}
					>
						{item.overdue ? `${t("returns.overdue")}` : null}
						{item.overdue && item.nextDeadline ? " · " : null}
						{item.nextDeadline
							? t("returns.deadline", {
									date: new Date(item.nextDeadline).toLocaleDateString(locale),
								})
							: null}
					</Text>
				</View>
			) : null}
		</Pressable>
	);
}

const styles = StyleSheet.create({
	safe: { flex: 1 },
	list: { padding: 16, paddingBottom: 40 },
	separator: { height: 10 },
	card: {
		borderRadius: 16,
		borderWidth: StyleSheet.hairlineWidth,
		gap: 6,
		padding: 16,
	},
	pressed: { opacity: 0.85 },
	row: {
		alignItems: "center",
		flexDirection: "row",
		justifyContent: "space-between",
		gap: 12,
	},
	number: {
		flexShrink: 1,
		fontFamily: Fonts.displayBold,
		fontSize: 18,
		lineHeight: 24,
		fontVariant: ["tabular-nums"],
	},
	body: { fontFamily: Fonts.body, fontSize: 15, lineHeight: 22 },
	amount: { fontFamily: Fonts.bodySemibold, fontSize: 15, lineHeight: 22 },
	deadline: { flexDirection: "row", alignItems: "center", gap: 6 },
	meta: {
		flexShrink: 1,
		fontFamily: Fonts.bodyMedium,
		fontSize: 13,
		lineHeight: 18,
	},
});
