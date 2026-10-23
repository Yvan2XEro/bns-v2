import { Ionicons } from "@expo/vector-icons";
import { FlashList } from "@shopify/flash-list";
import { useLocalSearchParams } from "expo-router";
import { useReducer, useState } from "react";
import {
	ActivityIndicator,
	RefreshControl,
	StyleSheet,
	TextInput,
	View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Fonts } from "@/constants/theme";
import { EmptyState } from "@/src/components/EmptyState";
import type { SplitListProps } from "@/src/components/layout/SplitScreen";
import { OrderRow } from "@/src/components/sellerOrders/OrderRow";
import { OrderTabs } from "@/src/components/sellerOrders/OrderTabs";
import { SellerEndSheet } from "@/src/components/sellerOrders/SellerEndSheet";
import { useDebouncedValue } from "@/src/components/sellerOrders/useClock";
import { SellerHeader } from "@/src/components/shop/SellerHeader";
import { useShopTheme } from "@/src/components/shop/theme";
import { useActiveShop } from "@/src/hooks/useActiveShop";
import { useAcceptOrderFromList } from "@/src/hooks/useOrderActions";
import { useSellerOrders } from "@/src/hooks/useSellerOrders";
import { resolveErrorMessage } from "@/src/lib/apiError";
import { useTranslation } from "@/src/lib/i18n";
import type { ShopOrderTab } from "@/src/lib/orderStatus";
import { initialShopOrderTab, rowQuickActions } from "@/src/lib/sellerOrders";

interface State {
	tab: ShopOrderTab;
	search: string;
}

function reducer(state: State, patch: Partial<State>): State {
	return { ...state, ...patch };
}

/** The shop's orders, by tab and search; an order opens through `onOpen`. */
export function SellerOrdersList({ selectedId, onOpen }: SplitListProps) {
	const c = useShopTheme();
	const { t } = useTranslation();
	const params = useLocalSearchParams<{ tab?: string }>();
	const [state, patch] = useReducer(reducer, {
		tab: initialShopOrderTab(params.tab),
		search: "",
	});
	const { shop, isLoading: shopLoading } = useActiveShop();

	// The counts narrow with `q` exactly as the rows do, so both read one query.
	const q = useDebouncedValue(state.search.trim(), 300);
	const orders = useSellerOrders(shop?.shopId, {
		tab: state.tab,
		q: q || undefined,
	});
	const counts = orders.data?.pages[0]?.counts;
	const rows = orders.data?.pages.flatMap((page) => page.docs) ?? [];
	const acceptFromList = useAcceptOrderFromList(shop?.shopId);
	const [declining, setDeclining] = useState<string | null>(null);
	const [rowError, setRowError] = useState<{
		id: string;
		message: string;
	} | null>(null);
	const acceptingId = acceptFromList.isPending
		? acceptFromList.variables
		: undefined;

	const accept = (id: string) => {
		setRowError(null);
		acceptFromList.mutate(id, {
			onError: (error) =>
				setRowError({
					id,
					message: resolveErrorMessage(
						error,
						t,
						t("sellerOrders.actionFailed"),
					),
				}),
		});
	};

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
				<SellerHeader title={t("sellerOrders.title")} />
				<EmptyState
					illustration="empty"
					title={t("sellerOrders.noShopTitle")}
					subtitle={t("sellerOrders.noShopBody")}
				/>
			</SafeAreaView>
		);
	}

	return (
		<SafeAreaView
			edges={["top"]}
			style={[styles.safe, { backgroundColor: c.bg }]}
		>
			<SellerHeader title={t("sellerOrders.title")} subtitle={shop.name} />

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
					placeholder={t("sellerOrders.search")}
					placeholderTextColor={c.muted}
					accessibilityLabel={t("sellerOrders.search")}
					maxLength={120}
					returnKeyType="search"
					autoCorrect={false}
					style={[styles.searchInput, { color: c.text }]}
				/>
			</View>

			<OrderTabs
				active={state.tab}
				counts={counts}
				onChange={(tab) => patch({ tab })}
			/>

			{orders.isLoading ? (
				<ActivityIndicator style={styles.spinner} color={c.primary} />
			) : orders.isError ? (
				<EmptyState
					illustration="notFound"
					title={t("sellerOrders.loadError")}
					ctaLabel={t("common.retry")}
					onCta={() => orders.refetch()}
				/>
			) : rows.length === 0 ? (
				<EmptyState
					illustration={q ? "searching" : "empty"}
					title={
						q
							? t("sellerOrders.emptySearch", { query: q })
							: t("sellerOrders.empty")
					}
				/>
			) : (
				<FlashList
					data={rows}
					keyExtractor={(row) => row.id}
					contentContainerStyle={styles.list}
					ItemSeparatorComponent={() => <View style={styles.separator} />}
					extraData={{ acceptingId, rowError, selectedId }}
					renderItem={({ item }) => (
						<OrderRow
							order={item}
							onPress={() => onOpen(item.id)}
							selected={item.id === selectedId}
							actions={rowQuickActions(item, shop.role)}
							accepting={acceptingId === item.id}
							busy={acceptingId === item.id}
							error={rowError?.id === item.id ? rowError.message : null}
							onAccept={() => accept(item.id)}
							onDecline={() => {
								setRowError(null);
								setDeclining(item.id);
							}}
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
						if (orders.hasNextPage && !orders.isFetchingNextPage) {
							orders.fetchNextPage();
						}
					}}
					onEndReachedThreshold={0.5}
					ListFooterComponent={
						orders.isFetchingNextPage ? (
							<ActivityIndicator style={styles.footer} color={c.primary} />
						) : null
					}
				/>
			)}
			<SellerEndSheet
				mode="decline"
				visible={declining !== null}
				orderId={declining ?? ""}
				shopId={shop.shopId}
				onClose={() => setDeclining(null)}
			/>
		</SafeAreaView>
	);
}

const styles = StyleSheet.create({
	safe: { flex: 1 },
	spinner: { marginTop: 40 },
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
	searchInput: { flex: 1, fontSize: 15, fontFamily: Fonts.body },
	list: { paddingHorizontal: 16, paddingBottom: 32 },
	separator: { height: 10 },
	footer: { marginVertical: 16 },
});
