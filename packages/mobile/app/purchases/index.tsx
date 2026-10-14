import { FlashList } from "@shopify/flash-list";
import { useState } from "react";
import {
	ActivityIndicator,
	Pressable,
	RefreshControl,
	StyleSheet,
	Text,
	View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Fonts } from "@/constants/theme";
import { EmptyState } from "@/src/components/EmptyState";
import { PurchaseRow } from "@/src/components/purchases/PurchaseRow";
import { SellerHeader } from "@/src/components/shop/SellerHeader";
import { useShopTheme } from "@/src/components/shop/theme";
import { usePurchases } from "@/src/hooks/usePurchases";
import { resolveErrorMessage } from "@/src/lib/apiError";
import { useTranslation } from "@/src/lib/i18n";
import {
	PURCHASE_TAB_LABEL_KEYS,
	PURCHASE_TABS,
	type PurchaseTab,
	purchaseTab,
} from "@/src/lib/purchaseActions";

export default function PurchasesScreen() {
	const c = useShopTheme();
	const { t } = useTranslation();
	const [tab, setTab] = useState<PurchaseTab>("open");
	const purchases = usePurchases();

	const pages = purchases.data?.pages ?? [];
	const all = pages.flatMap((page) => page.docs);
	const entries = all.filter((entry) => purchaseTab(entry.status) === tab);
	const countOf = (key: PurchaseTab) =>
		all.filter((entry) => purchaseTab(entry.status) === key).length;
	const nothingYet =
		purchases.isSuccess &&
		!purchases.hasNextPage &&
		pages.every((page) => page.docs.length === 0);

	return (
		<SafeAreaView
			edges={["top"]}
			style={[styles.safe, { backgroundColor: c.bg }]}
		>
			<SellerHeader title={t("purchases.title")} />

			<View
				style={[styles.tabs, { backgroundColor: c.neutralSoft }]}
				accessibilityRole="tablist"
			>
				{PURCHASE_TABS.map((key) => {
					const selected = tab === key;
					const count = countOf(key);
					return (
						<Pressable
							key={key}
							onPress={() => setTab(key)}
							accessibilityRole="tab"
							accessibilityState={{ selected }}
							accessibilityLabel={`${t(PURCHASE_TAB_LABEL_KEYS[key])} ${count}`}
							style={[
								styles.tab,
								selected && [styles.tabSelected, { backgroundColor: c.card }],
							]}
						>
							<Text
								style={[
									styles.tabText,
									{ color: selected ? c.primary : c.muted },
								]}
								numberOfLines={1}
							>
								{t(PURCHASE_TAB_LABEL_KEYS[key])}
							</Text>
							{count > 0 ? (
								<View
									style={[
										styles.tabCount,
										{ backgroundColor: selected ? c.primarySoft : c.card },
									]}
								>
									<Text
										style={[
											styles.tabCountText,
											{ color: selected ? c.primary : c.muted },
										]}
									>
										{count}
									</Text>
								</View>
							) : null}
						</Pressable>
					);
				})}
			</View>

			{purchases.isPending ? (
				<View style={styles.center}>
					<ActivityIndicator color={c.primary} />
				</View>
			) : purchases.isError ? (
				<EmptyState
					illustration="notFound"
					title={t("purchases.listLoadError")}
					subtitle={resolveErrorMessage(purchases.error, t)}
					ctaLabel={t("purchases.retry")}
					onCta={() => void purchases.refetch()}
				/>
			) : nothingYet ? (
				<EmptyState illustration="empty" title={t("purchases.empty")} />
			) : (
				<FlashList
					data={entries}
					keyExtractor={(entry) => entry.id}
					renderItem={({ item }) => <PurchaseRow entry={item} />}
					contentContainerStyle={{ padding: 16, paddingBottom: 40 }}
					ItemSeparatorComponent={() => <View style={{ height: 10 }} />}
					refreshControl={
						<RefreshControl
							refreshing={purchases.isRefetching}
							onRefresh={() => void purchases.refetch()}
							tintColor={c.primary}
						/>
					}
					onEndReached={() => {
						if (purchases.hasNextPage && !purchases.isFetchingNextPage) {
							void purchases.fetchNextPage();
						}
					}}
					ListEmptyComponent={
						<Text style={[styles.empty, { color: c.muted }]}>
							{t("purchases.tabEmpty")}
						</Text>
					}
					ListFooterComponent={
						purchases.hasNextPage ? (
							<Pressable
								onPress={() => void purchases.fetchNextPage()}
								disabled={purchases.isFetchingNextPage}
								accessibilityRole="button"
								accessibilityLabel={t("purchases.loadMore")}
								style={styles.more}
							>
								{purchases.isFetchingNextPage ? (
									<ActivityIndicator color={c.primary} />
								) : (
									<Text style={[styles.moreText, { color: c.primary }]}>
										{t("purchases.loadMore")}
									</Text>
								)}
							</Pressable>
						) : null
					}
				/>
			)}
		</SafeAreaView>
	);
}

const styles = StyleSheet.create({
	safe: { flex: 1 },
	center: { flex: 1, alignItems: "center", justifyContent: "center" },
	tabs: {
		flexDirection: "row",
		gap: 4,
		marginHorizontal: 16,
		marginTop: 12,
		padding: 4,
		borderRadius: 14,
	},
	tab: {
		flex: 1,
		flexDirection: "row",
		minHeight: 40,
		borderRadius: 11,
		paddingHorizontal: 8,
		gap: 6,
		alignItems: "center",
		justifyContent: "center",
	},
	tabSelected: {
		shadowColor: "#0f172a",
		shadowOffset: { width: 0, height: 1 },
		shadowOpacity: 0.08,
		shadowRadius: 3,
		elevation: 1,
	},
	tabText: { fontSize: 14, fontFamily: Fonts.bodySemibold, flexShrink: 1 },
	tabCount: {
		minWidth: 20,
		paddingHorizontal: 6,
		borderRadius: 999,
		alignItems: "center",
	},
	tabCountText: { fontSize: 12, fontFamily: Fonts.bodySemibold },
	empty: {
		fontSize: 14,
		fontFamily: Fonts.body,
		textAlign: "center",
		marginTop: 24,
	},
	more: {
		minHeight: 44,
		alignItems: "center",
		justifyContent: "center",
		marginTop: 12,
	},
	moreText: { fontSize: 14, fontFamily: Fonts.bodySemibold },
});
