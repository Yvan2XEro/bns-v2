import { Ionicons } from "@expo/vector-icons";
import { FlashList } from "@shopify/flash-list";
import { router } from "expo-router";
import { useReducer } from "react";
import {
	ActivityIndicator,
	Pressable,
	RefreshControl,
	StyleSheet,
	Text,
	TextInput,
	View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Fonts } from "@/constants/theme";
import { EmptyState } from "@/src/components/EmptyState";
import { useDebouncedValue } from "@/src/components/sellerOrders/useClock";
import { SellerHeader } from "@/src/components/shop/SellerHeader";
import { useShopTheme } from "@/src/components/shop/theme";
import { useActiveShop } from "@/src/hooks/useActiveShop";
import { useShopPurchaseOrders } from "@/src/hooks/usePurchaseOrders";
import { useTranslation } from "@/src/lib/i18n";
import { formatXaf } from "@/src/lib/orderMoney";
import type { PurchaseOrderListRow } from "../../../../../api/src/contracts/purchaseOrders";

type Side = "supplier" | "reseller";
interface State {
	side: Side;
	search: string;
}
function reducer(state: State, patch: Partial<State>): State {
	return { ...state, ...patch };
}

export default function ResalePurchaseOrdersScreen() {
	const c = useShopTheme();
	const { t, i18n } = useTranslation();
	const { shop, isLoading: shopLoading } = useActiveShop();
	const [state, patch] = useReducer(reducer, { side: "supplier", search: "" });
	const q = useDebouncedValue(state.search.trim(), 300);
	const orders = useShopPurchaseOrders(shop?.shopId, {
		side: state.side,
		q: q || undefined,
	});
	const rows = orders.data?.pages.flatMap((page) => page.docs) ?? [];
	const locale = i18n.language?.startsWith("en") ? "en" : "fr";

	if (shopLoading) {
		return (
			<SafeAreaView
				edges={["top"]}
				style={[styles.safe, { backgroundColor: c.bg }]}
			>
				<ActivityIndicator style={styles.spinner} color={c.primary} />
			</SafeAreaView>
		);
	}
	if (!shop) {
		return (
			<SafeAreaView
				edges={["top"]}
				style={[styles.safe, { backgroundColor: c.bg }]}
			>
				<SellerHeader title={t("sellerResale.title")} />
				<EmptyState
					illustration="empty"
					title={t("sellerResale.noShopTitle")}
					subtitle={t("sellerResale.noShopBody")}
				/>
			</SafeAreaView>
		);
	}

	return (
		<SafeAreaView
			edges={["top"]}
			style={[styles.safe, { backgroundColor: c.bg }]}
		>
			<SellerHeader title={t("sellerResale.title")} subtitle={shop.name} />
			<Pressable
				onPress={() => router.push("/seller/resale/finance")}
				accessibilityRole="button"
				accessibilityLabel={t("sellerResale.financeLink")}
				style={[
					styles.financeLink,
					{ borderColor: c.border, backgroundColor: c.card },
				]}
			>
				<Text style={[styles.financeLinkText, { color: c.primary }]}>
					{t("sellerResale.financeLink")}
				</Text>
				<Ionicons name="chevron-forward" size={18} color={c.primary} />
			</Pressable>
			<View style={styles.tabs}>
				{(["supplier", "reseller"] as const).map((side) => (
					<Pressable
						key={side}
						onPress={() => patch({ side })}
						accessibilityRole="tab"
						accessibilityState={{ selected: state.side === side }}
						style={[
							styles.tab,
							{
								borderColor: state.side === side ? c.primary : c.border,
								backgroundColor: state.side === side ? c.primary : c.card,
							},
						]}
					>
						<Text
							style={[
								styles.tabText,
								{ color: state.side === side ? "#ffffff" : c.text },
							]}
						>
							{t(`sellerResale.${side}`)}
						</Text>
					</Pressable>
				))}
			</View>
			<View
				style={[
					styles.search,
					{ backgroundColor: c.input, borderColor: c.border },
				]}
			>
				<Ionicons name="search" size={18} color={c.muted} />
				<TextInput
					value={state.search}
					onChangeText={(search) => patch({ search })}
					placeholder={t("sellerResale.search")}
					placeholderTextColor={c.muted}
					accessibilityLabel={t("sellerResale.search")}
					maxLength={120}
					returnKeyType="search"
					style={[styles.input, { color: c.text }]}
				/>
			</View>
			{orders.isLoading ? (
				<ActivityIndicator style={styles.spinner} color={c.primary} />
			) : orders.isError ? (
				<EmptyState
					illustration="notFound"
					title={t("sellerResale.loadError")}
					ctaLabel={t("common.retry")}
					onCta={() => orders.refetch()}
				/>
			) : rows.length === 0 ? (
				<EmptyState
					illustration={q ? "searching" : "empty"}
					title={
						q
							? t("sellerResale.emptySearch", { query: q })
							: t("sellerResale.empty")
					}
				/>
			) : (
				<FlashList
					data={rows}
					keyExtractor={(row) => row.id}
					contentContainerStyle={styles.list}
					ItemSeparatorComponent={() => <View style={{ height: 10 }} />}
					renderItem={({ item }) => (
						<PurchaseOrderRow
							row={item}
							side={state.side}
							locale={locale}
							onPress={() =>
								router.push({
									pathname: "/seller/resale/purchase-orders/[id]",
									params: { id: item.id, side: state.side },
								})
							}
						/>
					)}
					refreshControl={
						<RefreshControl
							refreshing={orders.isRefetching && !orders.isFetchingNextPage}
							onRefresh={() => orders.refetch()}
							tintColor={c.primary}
						/>
					}
					onEndReached={() => {
						if (orders.hasNextPage && !orders.isFetchingNextPage)
							orders.fetchNextPage();
					}}
					onEndReachedThreshold={0.5}
					ListFooterComponent={
						orders.isFetchingNextPage ? (
							<ActivityIndicator style={styles.spinner} color={c.primary} />
						) : null
					}
				/>
			)}
		</SafeAreaView>
	);
}

function PurchaseOrderRow({
	row,
	side,
	locale,
	onPress,
}: {
	row: PurchaseOrderListRow;
	side: Side;
	locale: "fr" | "en";
	onPress: () => void;
}) {
	const c = useShopTheme();
	const { t } = useTranslation();
	const status = t(`sellerResale.status_${row.status}`);
	const counterparty =
		side === "supplier" ? row.counterparty.name : row.counterparty.name;
	return (
		<Pressable
			onPress={onPress}
			accessibilityRole="button"
			accessibilityLabel={`${row.number}, ${status}, ${counterparty}`}
			style={[styles.card, { backgroundColor: c.card, borderColor: c.border }]}
		>
			<View style={styles.line}>
				<Text style={[styles.number, { color: c.text }]}>{row.number}</Text>
				<Text style={[styles.amount, { color: c.text }]}>
					{formatXaf(row.collectAmount, locale)}
				</Text>
			</View>
			<Text style={[styles.meta, { color: c.body }]} numberOfLines={1}>
				{counterparty} ·{" "}
				{row.items.map((item) => `${item.quantity} × ${item.title}`).join(", ")}
			</Text>
			<View style={styles.line}>
				<Text style={[styles.meta, { color: c.primary }]}>{status}</Text>
				<Ionicons name="chevron-forward" size={18} color={c.muted} />
			</View>
		</Pressable>
	);
}

const styles = StyleSheet.create({
	safe: { flex: 1 },
	spinner: { marginTop: 40 },
	financeLink: {
		alignItems: "center",
		borderRadius: 12,
		borderWidth: 1,
		flexDirection: "row",
		justifyContent: "space-between",
		marginHorizontal: 16,
		marginTop: 12,
		minHeight: 46,
		paddingHorizontal: 14,
	},
	financeLinkText: { fontFamily: Fonts.bodySemibold, fontSize: 14 },
	tabs: { flexDirection: "row", gap: 8, paddingHorizontal: 16, paddingTop: 12 },
	tab: {
		flex: 1,
		minHeight: 44,
		borderWidth: 1,
		borderRadius: 12,
		alignItems: "center",
		justifyContent: "center",
		paddingHorizontal: 8,
	},
	tabText: {
		fontFamily: Fonts.bodySemibold,
		fontSize: 13,
		textAlign: "center",
	},
	search: {
		flexDirection: "row",
		alignItems: "center",
		gap: 8,
		marginHorizontal: 16,
		marginTop: 12,
		paddingHorizontal: 12,
		borderRadius: 12,
		borderWidth: 1,
		minHeight: 44,
	},
	input: { flex: 1, fontSize: 15, fontFamily: Fonts.body },
	list: { paddingHorizontal: 16, paddingVertical: 14 },
	card: {
		padding: 14,
		borderRadius: 14,
		borderWidth: 1,
		gap: 8,
		minHeight: 44,
	},
	line: {
		flexDirection: "row",
		alignItems: "center",
		justifyContent: "space-between",
		gap: 8,
	},
	number: { flex: 1, fontSize: 15, fontFamily: Fonts.displayBold },
	amount: { fontSize: 14, fontFamily: Fonts.bodyBold },
	meta: { fontSize: 13, fontFamily: Fonts.body },
});
