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
import { EmptyState } from "@/src/components/EmptyState";
import { SellerHeader } from "@/src/components/shop/SellerHeader";
import { useShopTheme } from "@/src/components/shop/theme";
import { useActiveShop } from "@/src/hooks/useActiveShop";
import { useShopReturns } from "@/src/hooks/useReturns";
import {
	RETURN_BASIS_LABELS,
	RETURN_CASE_STATUS_LABELS,
} from "@/src/lib/caseStatus";
import { useTranslation } from "@/src/lib/i18n";
import type { ReturnListRow } from "../../../../api/src/contracts/returns";

export default function SellerReturnsScreen() {
	const c = useShopTheme();
	const { t, i18n } = useTranslation();
	const { shop, isLoading: shopLoading } = useActiveShop();
	const returns = useShopReturns(shop?.shopId);

	if (shopLoading || returns.isPending) {
		return (
			<SafeAreaView style={[styles.safe, { backgroundColor: c.bg }]}>
				<SellerHeader title={t("sellerReturns.title")} />
				<ActivityIndicator style={styles.loading} color={c.primary} />
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
				<FlashList
					data={returns.data?.rows ?? []}
					keyExtractor={(row) => row.id}
					contentContainerStyle={styles.list}
					ItemSeparatorComponent={() => <View style={styles.gap} />}
					renderItem={({ item }) => (
						<ReturnRow item={item} locale={i18n.language} />
					)}
					refreshing={returns.isRefetching}
					onRefresh={() => void returns.refetch()}
				/>
			)}
		</SafeAreaView>
	);
}

function ReturnRow({ item, locale }: { item: ReturnListRow; locale: string }) {
	const c = useShopTheme();
	const { t } = useTranslation();
	return (
		<Pressable
			accessibilityRole="button"
			onPress={() =>
				router.push({ pathname: "/returns/[id]", params: { id: item.id } })
			}
			style={[styles.card, { backgroundColor: c.card, borderColor: c.border }]}
		>
			<View style={styles.row}>
				<Text style={[styles.number, { color: c.text }]}>{item.number}</Text>
				{item.overdue ? (
					<Text style={styles.overdue}>{t("returns.overdue")}</Text>
				) : null}
			</View>
			<Text style={[styles.body, { color: c.muted }]}>
				{t("returns.order", { number: item.orderNumber })} ·{" "}
				{t(RETURN_BASIS_LABELS[item.basis])}
			</Text>
			<Text style={[styles.body, { color: c.muted }]}>
				{t(RETURN_CASE_STATUS_LABELS[item.status])} ·{" "}
				{t("returns.refundAmount", {
					amount: item.refundAmount.toLocaleString(locale),
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
	loading: { marginTop: 40 },
	list: { padding: 16 },
	gap: { height: 10 },
	card: { borderRadius: 14, borderWidth: 1, gap: 7, padding: 15 },
	row: {
		alignItems: "center",
		flexDirection: "row",
		justifyContent: "space-between",
	},
	number: { fontFamily: Fonts.displaySemibold, fontSize: 16 },
	body: { fontFamily: Fonts.body, fontSize: 13 },
	overdue: { color: "#dc2626", fontFamily: Fonts.bodySemibold, fontSize: 12 },
});
