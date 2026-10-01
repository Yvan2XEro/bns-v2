import { FlashList } from "@shopify/flash-list";
import { router } from "expo-router";
import { useState } from "react";
import {
	ActivityIndicator,
	RefreshControl,
	StyleSheet,
	View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { EmptyState } from "@/src/components/EmptyState";
import { InboxFilterChips } from "@/src/components/shop/inbox/InboxFilterChips";
import { InboxRow } from "@/src/components/shop/inbox/InboxRow";
import { SellerHeader } from "@/src/components/shop/SellerHeader";
import { useShopTheme } from "@/src/components/shop/theme";
import { useActiveShop } from "@/src/hooks/useActiveShop";
import { useShopInbox } from "@/src/hooks/useShopInbox";
import { useShopInboxSocket } from "@/src/hooks/useShopInboxSocket";
import { useTranslation } from "@/src/lib/i18n";
import { can } from "@/src/lib/shopRoles";
import type { InboxConversationView, InboxFilter } from "@/src/types/api";

export default function SellerInboxScreen() {
	const c = useShopTheme();
	const { t } = useTranslation();
	const { shop, isLoading: shopLoading } = useActiveShop();
	const shopId = shop?.shopId ?? null;
	const [filter, setFilter] = useState<InboxFilter>("all");

	useShopInboxSocket(shopId);

	const inbox = useShopInbox(shopId ?? undefined, { filter });
	const rows: InboxConversationView[] =
		inbox.data?.pages.flatMap((page) => page.docs) ?? [];
	const totals = inbox.data?.pages[0]?.totals;

	if (shopLoading) {
		return (
			<SafeAreaView
				edges={["top"]}
				style={[styles.safe, { backgroundColor: c.bg }]}
			>
				<ActivityIndicator style={{ marginTop: 60 }} color={c.primary} />
			</SafeAreaView>
		);
	}

	if (!shop) {
		return (
			<SafeAreaView
				edges={["top"]}
				style={[styles.safe, { backgroundColor: c.bg }]}
			>
				<SellerHeader title={t("inbox.title")} />
				<EmptyState
					illustration="messages"
					title={t("inbox.noShopTitle")}
					subtitle={t("inbox.noShopSub")}
				/>
			</SafeAreaView>
		);
	}

	if (!can(shop.role, "inbox.reply")) {
		return (
			<SafeAreaView
				edges={["top"]}
				style={[styles.safe, { backgroundColor: c.bg }]}
			>
				<SellerHeader title={t("inbox.title")} subtitle={shop.name} />
				<EmptyState
					icon="lock-closed-outline"
					title={t("inbox.lockedTitle")}
					subtitle={t("inbox.lockedSub")}
				/>
			</SafeAreaView>
		);
	}

	return (
		<SafeAreaView
			edges={["top"]}
			style={[styles.safe, { backgroundColor: c.bg }]}
		>
			<SellerHeader title={t("inbox.title")} subtitle={shop.name} />
			<InboxFilterChips active={filter} totals={totals} onChange={setFilter} />

			{inbox.isLoading ? (
				<ActivityIndicator style={{ marginTop: 40 }} color={c.primary} />
			) : inbox.isError ? (
				<EmptyState
					icon="cloud-offline-outline"
					title={t("home.errorTitle")}
					subtitle={t("home.errorSub")}
					ctaLabel={t("common.retry")}
					onCta={() => inbox.refetch()}
				/>
			) : rows.length === 0 ? (
				<EmptyState
					illustration="messages"
					title={t("inbox.emptyTitle")}
					subtitle={t("inbox.emptySub")}
				/>
			) : (
				<FlashList
					data={rows}
					keyExtractor={(row) => row.id}
					renderItem={({ item }) => (
						<InboxRow
							item={item}
							onPress={() => router.push(`/seller/inbox/${item.id}`)}
						/>
					)}
					refreshControl={
						<RefreshControl
							refreshing={inbox.isRefetching && !inbox.isFetchingNextPage}
							onRefresh={() => inbox.refetch()}
							tintColor={c.primary}
						/>
					}
					onEndReached={() =>
						inbox.hasNextPage &&
						!inbox.isFetchingNextPage &&
						inbox.fetchNextPage()
					}
					onEndReachedThreshold={0.5}
					contentContainerStyle={{ paddingBottom: 24 }}
					ListFooterComponent={
						inbox.isFetchingNextPage ? (
							<View style={{ paddingVertical: 16 }}>
								<ActivityIndicator color={c.primary} />
							</View>
						) : null
					}
				/>
			)}
		</SafeAreaView>
	);
}

const styles = StyleSheet.create({
	safe: { flex: 1 },
});
