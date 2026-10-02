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
	const entries = pages
		.flatMap((page) => page.docs)
		.filter((entry) => purchaseTab(entry.status) === tab);
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

			<View style={styles.tabs} accessibilityRole="tablist">
				{PURCHASE_TABS.map((key) => {
					const selected = tab === key;
					return (
						<Pressable
							key={key}
							onPress={() => setTab(key)}
							accessibilityRole="tab"
							accessibilityState={{ selected }}
							accessibilityLabel={t(PURCHASE_TAB_LABEL_KEYS[key])}
							style={[
								styles.tab,
								{ backgroundColor: selected ? c.primary : c.primarySoft },
							]}
						>
							<Text
								style={[
									styles.tabText,
									{ color: selected ? "#ffffff" : c.primary },
								]}
							>
								{t(PURCHASE_TAB_LABEL_KEYS[key])}
							</Text>
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
		gap: 8,
		paddingHorizontal: 16,
		paddingTop: 12,
	},
	tab: {
		minHeight: 44,
		borderRadius: 12,
		paddingHorizontal: 14,
		justifyContent: "center",
	},
	tabText: { fontSize: 14, fontFamily: Fonts.bodySemibold },
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
