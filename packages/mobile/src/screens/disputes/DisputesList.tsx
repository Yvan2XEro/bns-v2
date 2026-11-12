import { Ionicons } from "@expo/vector-icons";
import { FlashList } from "@shopify/flash-list";
import { router } from "expo-router";
import { useCallback, useState } from "react";
import {
	Pressable,
	RefreshControl,
	StyleSheet,
	Text,
	View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Fonts } from "@/constants/theme";
import {
	CaseStatusPill,
	disputeTone,
} from "@/src/components/checkout/CaseStatusPill";
import { OrderListSkeleton } from "@/src/components/checkout/OrderListSkeleton";
import { EmptyState } from "@/src/components/EmptyState";
import { ScreenColumn } from "@/src/components/layout/ScreenColumn";
import type { SplitListProps } from "@/src/components/layout/SplitScreen";
import { useSelectedRowStyle } from "@/src/components/layout/selectedRow";
import { SellerHeader } from "@/src/components/shop/SellerHeader";
import { useShopTheme } from "@/src/components/shop/theme";
import { useBuyerDisputes } from "@/src/hooks/useDisputes";
import {
	DISPUTE_REASON_LABELS,
	DISPUTE_STATUS_LABELS,
} from "@/src/lib/caseStatus";
import { useTranslation } from "@/src/lib/i18n";
import { formatPrice } from "@/src/lib/market";
import type { DisputeListRow } from "../../../../api/src/contracts/disputes";

export function DisputesList({ selectedId, onOpen }: SplitListProps) {
	const c = useShopTheme();
	const { t, i18n } = useTranslation();
	const query = useBuyerDisputes();
	// A pull is the buyer's own; a background refetch never spins it.
	const [pulling, setPulling] = useState(false);
	const { refetch } = query;
	const onRefresh = useCallback(() => {
		setPulling(true);
		void refetch().finally(() => setPulling(false));
	}, [refetch]);
	return (
		<SafeAreaView
			edges={["top"]}
			style={[styles.safe, { backgroundColor: c.bg }]}
		>
			<SellerHeader title={t("disputes.title")} />
			{query.isPending ? <OrderListSkeleton /> : null}
			{query.isError ? (
				<EmptyState
					illustration="notFound"
					title={t("disputes.loadError")}
					ctaLabel={t("common.retry")}
					onCta={() => void query.refetch()}
				/>
			) : null}
			{query.data?.rows.length === 0 ? (
				<EmptyState
					illustration="empty"
					title={t("disputes.emptyTitle")}
					subtitle={t("disputes.emptyBody")}
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
						refreshControl={
							<RefreshControl
								refreshing={pulling}
								onRefresh={onRefresh}
								tintColor={c.primary}
								colors={[c.primary]}
							/>
						}
						renderItem={({ item }) => (
							<DisputeRow
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

function DisputeRow({
	item,
	locale,
	onPress,
	selected,
}: {
	item: DisputeListRow;
	locale: string;
	onPress: () => void;
	/** Open in the detail pane beside the list. */
	selected?: boolean;
}) {
	const c = useShopTheme();
	const { t } = useTranslation();
	const selectedStyle = useSelectedRowStyle()(selected);
	const status = t(DISPUTE_STATUS_LABELS[item.status]);
	const amount = formatPrice(item.amountAtStake, locale);
	return (
		<Pressable
			accessibilityRole="button"
			accessibilityLabel={`${item.number}, ${status}, ${amount}${
				item.overdue ? `, ${t("disputes.overdue")}` : ""
			}`}
			onPress={onPress}
			accessibilityState={{ selected: Boolean(selected) }}
			style={({ pressed }) => [
				styles.card,
				{ backgroundColor: c.card, borderColor: c.border },
				selectedStyle,
				pressed && styles.pressed,
			]}
		>
			<View style={styles.rowTop}>
				<Text style={[styles.number, { color: c.text }]} numberOfLines={1}>
					{item.number}
				</Text>
				<CaseStatusPill label={status} tone={disputeTone(item.status)} />
			</View>
			<Text style={[styles.description, { color: c.body }]}>
				{t("disputes.order", { number: item.orderNumber })} ·{" "}
				{t(DISPUTE_REASON_LABELS[item.reason])}
			</Text>
			<View style={styles.rowBottom}>
				<Text style={[styles.amount, { color: c.text }]}>{amount}</Text>
				{item.overdue ? (
					<View style={styles.overdue}>
						<Ionicons name="alert-circle" size={15} color={c.dangerText} />
						<Text style={[styles.overdueText, { color: c.dangerText }]}>
							{t("disputes.overdue")}
						</Text>
					</View>
				) : null}
				<Ionicons name="chevron-forward" size={18} color={c.muted} />
			</View>
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
		gap: 8,
		padding: 16,
	},
	pressed: { opacity: 0.85 },
	rowTop: {
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
	description: { fontFamily: Fonts.body, fontSize: 15, lineHeight: 22 },
	rowBottom: {
		alignItems: "center",
		flexDirection: "row",
		gap: 10,
	},
	amount: {
		flex: 1,
		fontFamily: Fonts.displayExtrabold,
		fontSize: 18,
		lineHeight: 24,
		fontVariant: ["tabular-nums"],
	},
	overdue: { flexDirection: "row", alignItems: "center", gap: 4 },
	overdueText: { fontFamily: Fonts.bodySemibold, fontSize: 13, lineHeight: 18 },
});
