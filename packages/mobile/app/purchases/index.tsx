import { FlashList } from "@shopify/flash-list";
import { router } from "expo-router";
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
import { SegmentedControl } from "@/src/components/ui/SegmentedControl";
import { usePurchases } from "@/src/hooks/usePurchases";
import { resolveErrorMessage } from "@/src/lib/apiError";
import { withGroupHeaders } from "@/src/lib/checkoutGroupFlow";
import { useTranslation } from "@/src/lib/i18n";
import {
	PURCHASE_TAB_LABEL_KEYS,
	PURCHASE_TABS,
	type PurchaseTab,
	purchaseTab,
} from "@/src/lib/purchaseActions";

function GroupHeader({ checkoutGroup }: { checkoutGroup: string }) {
	const c = useShopTheme();
	const { t } = useTranslation();
	return (
		<Pressable
			onPress={() =>
				router.push({
					pathname: "/purchases/group/[group]",
					params: { group: checkoutGroup },
				})
			}
			accessibilityRole="button"
			accessibilityLabel={t("checkoutGroup.openGroup")}
			style={styles.groupHeader}
		>
			<Text style={[styles.groupHeaderText, { color: c.primary }]}>
				{t("checkoutGroup.purchasesHeader")}
			</Text>
		</Pressable>
	);
}

export default function PurchasesScreen() {
	const c = useShopTheme();
	const { t } = useTranslation();
	const [tab, setTab] = useState<PurchaseTab>("open");
	const purchases = usePurchases();

	const pages = purchases.data?.pages ?? [];
	const all = pages.flatMap((page) => page.docs);
	const entries = all.filter((entry) => purchaseTab(entry.status) === tab);
	// Counted from the pages loaded so far: shown only once they are all in,
	// so a tab never claims fewer orders than the buyer has.
	const countOf = (key: PurchaseTab) =>
		purchases.hasNextPage
			? undefined
			: all.filter((entry) => purchaseTab(entry.status) === key).length;
	const items = withGroupHeaders(entries);
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

			<SegmentedControl
				segments={PURCHASE_TABS.map((key) => ({
					key,
					label: t(PURCHASE_TAB_LABEL_KEYS[key]),
					count: countOf(key),
				}))}
				value={tab}
				onChange={setTab}
				style={styles.tabs}
			/>

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
				<EmptyState
					illustration="empty"
					title={t("purchases.empty")}
					ctaLabel={t("purchases.emptyCta")}
					onCta={() => router.push("/(tabs)/search")}
				/>
			) : (
				<FlashList
					data={items}
					keyExtractor={(item) =>
						item.kind === "header"
							? `group:${item.checkoutGroup}`
							: item.entry.id
					}
					getItemType={(item) => item.kind}
					renderItem={({ item }) =>
						item.kind === "header" ? (
							<GroupHeader checkoutGroup={item.checkoutGroup} />
						) : (
							<PurchaseRow entry={item.entry} />
						)
					}
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
	tabs: { marginHorizontal: 16, marginTop: 12 },
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
	groupHeader: { minHeight: 44, justifyContent: "center" },
	groupHeaderText: { fontSize: 14, fontFamily: Fonts.bodySemibold },
	moreText: { fontSize: 14, fontFamily: Fonts.bodySemibold },
});
