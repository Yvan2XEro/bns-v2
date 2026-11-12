import { Ionicons } from "@expo/vector-icons";
import { FlashList } from "@shopify/flash-list";
import { router } from "expo-router";
import { useEffect, useState } from "react";
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
import { inkOf } from "@/src/components/checkout/fill";
import { OrderListSkeleton } from "@/src/components/checkout/OrderListSkeleton";
import { EmptyState } from "@/src/components/EmptyState";
import { ScreenColumn } from "@/src/components/layout/ScreenColumn";
import type { SplitListProps } from "@/src/components/layout/SplitScreen";
import { PurchaseRow } from "@/src/components/purchases/PurchaseRow";
import { SellerHeader } from "@/src/components/shop/SellerHeader";
import { useShopTheme } from "@/src/components/shop/theme";
import { SegmentedControl } from "@/src/components/ui/SegmentedControl";
import { usePurchases } from "@/src/hooks/usePurchases";
import { resolveErrorMessage } from "@/src/lib/apiError";
import { withGroupHeaders } from "@/src/lib/checkoutGroupFlow";
import { useTranslation } from "@/src/lib/i18n";
import { formatOrderDate } from "@/src/lib/orderMoney";
import {
	PURCHASE_TAB_LABEL_KEYS,
	PURCHASE_TABS,
	type PurchaseTab,
	purchaseTab,
} from "@/src/lib/purchaseActions";

function GroupHeader({
	checkoutGroup,
	count,
	placedAt,
}: {
	checkoutGroup: string;
	count: number;
	placedAt: string | null;
}) {
	const c = useShopTheme();
	const { t, i18n } = useTranslation();
	const lang = i18n.language?.startsWith("en") ? "en" : "fr";
	// Several groups must not sound the same to a screen reader.
	const label = placedAt
		? t("checkoutGroup.openGroupDetail", {
				date: formatOrderDate(placedAt, lang),
				count,
			})
		: t("checkoutGroup.openGroup");
	return (
		<Pressable
			onPress={() =>
				router.push({
					pathname: "/purchases/group/[group]",
					params: { group: checkoutGroup },
				})
			}
			accessibilityRole="button"
			accessibilityLabel={label}
			style={styles.groupHeader}
		>
			<Ionicons name="layers-outline" size={16} color={inkOf(c)} />
			<Text style={[styles.groupHeaderText, { color: inkOf(c) }]}>
				{t("checkoutGroup.purchasesHeader")}
			</Text>
			<Ionicons name="chevron-forward" size={16} color={inkOf(c)} />
		</Pressable>
	);
}

export function PurchasesList({ selectedId, onOpen }: SplitListProps) {
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
	const groupFacts = (checkoutGroup: string) => {
		const members = entries.filter(
			(entry) => entry.checkoutGroup === checkoutGroup,
		);
		return { count: members.length, placedAt: members[0]?.placedAt ?? null };
	};
	// Tabs filter the pages loaded so far: while a tab is empty and more
	// pages exist, keep loading instead of saying "nothing here" over a
	// "load more" button.
	const searching =
		entries.length === 0 &&
		Boolean(purchases.hasNextPage) &&
		!purchases.isFetchNextPageError;
	const { fetchNextPage, isFetchingNextPage } = purchases;
	useEffect(() => {
		if (searching && !isFetchingNextPage) void fetchNextPage();
	}, [searching, isFetchingNextPage, fetchNextPage]);
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
				<OrderListSkeleton />
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
				<ScreenColumn width="wide">
					<FlashList
						data={items}
						extraData={selectedId}
						keyExtractor={(item) =>
							item.kind === "header"
								? `group:${item.checkoutGroup}`
								: item.entry.id
						}
						getItemType={(item) => item.kind}
						renderItem={({ item }) =>
							item.kind === "header" ? (
								<GroupHeader
									checkoutGroup={item.checkoutGroup}
									{...groupFacts(item.checkoutGroup)}
								/>
							) : (
								<PurchaseRow
									entry={item.entry}
									selected={item.entry.id === selectedId}
									onPress={() => onOpen(item.entry.id)}
								/>
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
							searching ? (
								<OrderListSkeleton rows={2} />
							) : (
								<View style={styles.emptyWrap}>
									<Ionicons name="receipt-outline" size={28} color={c.muted} />
									<Text style={[styles.empty, { color: c.body }]}>
										{t("purchases.tabEmpty")}
									</Text>
								</View>
							)
						}
						ListFooterComponent={
							purchases.hasNextPage && !searching ? (
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
										<Text style={[styles.moreText, { color: inkOf(c) }]}>
											{t("purchases.loadMore")}
										</Text>
									)}
								</Pressable>
							) : null
						}
					/>
				</ScreenColumn>
			)}
		</SafeAreaView>
	);
}

const styles = StyleSheet.create({
	safe: { flex: 1 },
	tabs: { marginHorizontal: 16, marginTop: 12 },
	emptyWrap: { alignItems: "center", gap: 10, paddingTop: 40 },
	empty: {
		fontSize: 15,
		lineHeight: 22,
		fontFamily: Fonts.body,
		textAlign: "center",
		maxWidth: 280,
	},
	more: {
		minHeight: 48,
		alignItems: "center",
		justifyContent: "center",
		marginTop: 12,
	},
	groupHeader: {
		minHeight: 44,
		flexDirection: "row",
		alignItems: "center",
		gap: 6,
	},
	groupHeaderText: { flex: 1, fontSize: 14, fontFamily: Fonts.bodySemibold },
	moreText: { fontSize: 15, fontFamily: Fonts.bodySemibold },
});
