import { FlashList } from "@shopify/flash-list";
import {
	Pressable,
	RefreshControl,
	StyleSheet,
	Text,
	View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Fonts } from "@/constants/theme";
import { EmptyState } from "@/src/components/EmptyState";
import { ScreenColumn } from "@/src/components/layout/ScreenColumn";
import type { SplitListProps } from "@/src/components/layout/SplitScreen";
import { useSelectedRowStyle } from "@/src/components/layout/selectedRow";
import { ListSkeleton } from "@/src/components/shop/ListSkeleton";
import { SellerHeader } from "@/src/components/shop/SellerHeader";
import { StatusTag } from "@/src/components/shop/Tags";
import { useShopTheme } from "@/src/components/shop/theme";
import { useActiveShop } from "@/src/hooks/useActiveShop";
import { useShopReturns } from "@/src/hooks/useReturns";
import {
	RETURN_BASIS_LABELS,
	RETURN_CASE_STATUS_LABELS,
} from "@/src/lib/caseStatus";
import { useTranslation } from "@/src/lib/i18n";
import { formatPrice } from "@/src/lib/market";
import type { ReturnListRow } from "../../../../api/src/contracts/returns";

export function SellerReturnsList({ selectedId, onOpen }: SplitListProps) {
	const c = useShopTheme();
	const { t, i18n } = useTranslation();
	const { shop, isLoading: shopLoading } = useActiveShop();
	const returns = useShopReturns(shop?.shopId);

	if (shopLoading || returns.isPending) {
		return (
			<SafeAreaView style={[styles.safe, { backgroundColor: c.bg }]}>
				<SellerHeader title={t("sellerReturns.title")} />
				<ListSkeleton />
			</SafeAreaView>
		);
	}

	return (
		<SafeAreaView style={[styles.safe, { backgroundColor: c.bg }]}>
			<SellerHeader title={t("sellerReturns.title")} subtitle={shop?.name} />
			{!shop ? (
				<EmptyState illustration="empty" title={t("seller.noShopTitle")} />
			) : returns.isError ? (
				<EmptyState
					illustration="notFound"
					title={t("sellerReturns.loadError")}
					ctaLabel={t("common.retry")}
					onCta={() => void returns.refetch()}
				/>
			) : returns.data?.rows.length === 0 ? (
				<EmptyState
					illustration="empty"
					title={t("sellerReturns.emptyTitle")}
					subtitle={t("sellerReturns.emptyBody")}
				/>
			) : (
				<ScreenColumn width="wide">
					<FlashList
						data={returns.data?.rows ?? []}
						extraData={selectedId}
						keyExtractor={(row) => row.id}
						contentContainerStyle={styles.list}
						ItemSeparatorComponent={() => <View style={styles.gap} />}
						renderItem={({ item }) => (
							<ReturnRow
								item={item}
								locale={i18n.language}
								selected={item.id === selectedId}
								onPress={() => onOpen(item.id)}
							/>
						)}
						refreshControl={
							<RefreshControl
								refreshing={returns.isRefetching}
								onRefresh={() => void returns.refetch()}
								tintColor={c.primary}
							/>
						}
					/>
				</ScreenColumn>
			)}
		</SafeAreaView>
	);
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
	const selectedStyle = useSelectedRowStyle()(selected);
	const { t } = useTranslation();
	return (
		<Pressable
			accessibilityRole="button"
			onPress={onPress}
			accessibilityState={{ selected: Boolean(selected) }}
			style={[
				styles.card,
				{ backgroundColor: c.card, borderColor: c.border },
				selectedStyle,
			]}
		>
			<View style={styles.row}>
				<Text style={[styles.number, { color: c.text }]} numberOfLines={1}>
					{item.number}
				</Text>
				{item.overdue ? (
					<StatusTag label={t("returns.overdue")} tone="danger" />
				) : null}
			</View>
			<Text style={[styles.body, { color: c.body }]}>
				{t("returns.order", { number: item.orderNumber })} ·{" "}
				{t(RETURN_BASIS_LABELS[item.basis])}
			</Text>
			<Text style={[styles.body, { color: c.muted }]}>
				{t(RETURN_CASE_STATUS_LABELS[item.status])} ·{" "}
				{t("returns.refundAmount", {
					amount: formatPrice(item.refundAmount, locale),
				})}
			</Text>
			{item.nextDeadline ? (
				<Text style={[styles.body, { color: c.muted }]}>
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
	list: { padding: 16 },
	gap: { height: 10 },
	card: {
		borderRadius: 14,
		borderWidth: StyleSheet.hairlineWidth,
		gap: 7,
		padding: 15,
	},
	row: {
		alignItems: "center",
		flexDirection: "row",
		justifyContent: "space-between",
		gap: 8,
	},
	number: { flexShrink: 1, fontFamily: Fonts.displayBold, fontSize: 16 },
	body: { fontFamily: Fonts.body, fontSize: 13, lineHeight: 18 },
});
