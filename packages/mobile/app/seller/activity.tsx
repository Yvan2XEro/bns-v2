import { FlashList } from "@shopify/flash-list";
import { useMemo, useReducer } from "react";
import {
	ActivityIndicator,
	Pressable,
	RefreshControl,
	ScrollView,
	StyleSheet,
	Text,
	View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Fonts } from "@/constants/theme";
import { EmptyState } from "@/src/components/EmptyState";
import { SellerHeader } from "@/src/components/shop/SellerHeader";
import { ActivityRow } from "@/src/components/shop/team/ActivityRow";
import { useShopTheme } from "@/src/components/shop/theme";
import { useShopActivity } from "@/src/hooks/useShopActivity";
import { useMyShop } from "@/src/hooks/useShops";
import { useTranslation } from "@/src/lib/i18n";
import { ACTIVITY_ACTIONS, activityLabelKey } from "@/src/lib/shopActivity";
import { can } from "@/src/lib/shopRoles";
import type { ShopActivityAction, ShopActivityView } from "@/src/types/api";

interface FilterState {
	action: ShopActivityAction | null;
}

const initialState: FilterState = { action: null };

function reducer(state: FilterState, patch: Partial<FilterState>): FilterState {
	return { ...state, ...patch };
}

export default function ShopActivityScreen() {
	const c = useShopTheme();
	const { t } = useTranslation();
	const [state, patch] = useReducer(reducer, initialState);

	const mine = useMyShop();
	const shop = mine.data?.shop;
	const role = mine.data?.role;
	const allowed = can(role, "activity.view");

	const activity = useShopActivity(
		allowed ? shop?.id : undefined,
		state.action ? { action: state.action } : {},
	);

	const rows: ShopActivityView[] = useMemo(
		() => activity.data?.pages.flatMap((page) => page.docs) ?? [],
		[activity.data],
	);

	const isLoading = mine.isLoading || (allowed && activity.isLoading);

	return (
		<SafeAreaView
			edges={["top"]}
			style={[styles.safe, { backgroundColor: c.bg }]}
		>
			<SellerHeader title={t("shopActivity.title")} />

			{isLoading ? (
				<View style={styles.center}>
					<ActivityIndicator color={c.primary} />
				</View>
			) : !allowed ? (
				<EmptyState
					illustration="auth"
					title={t("shopActivity.lockedTitle")}
					subtitle={t("shopActivity.lockedBody")}
				/>
			) : (
				<>
					<ScrollView
						horizontal
						showsHorizontalScrollIndicator={false}
						style={styles.filtersScroll}
						contentContainerStyle={styles.filters}
					>
						<Pressable
							onPress={() => patch({ action: null })}
							style={[
								styles.filter,
								{
									backgroundColor: state.action === null ? c.primary : c.card,
									borderColor: state.action === null ? c.primary : c.border,
								},
							]}
							accessibilityRole="button"
							accessibilityLabel={t("shopActivity.filterAny")}
							accessibilityState={{ selected: state.action === null }}
						>
							<Text
								style={[
									styles.filterText,
									{ color: state.action === null ? "#fff" : c.body },
								]}
							>
								{t("shopActivity.filterAny")}
							</Text>
						</Pressable>
						{ACTIVITY_ACTIONS.map((action) => {
							const active = state.action === action;
							return (
								<Pressable
									key={action}
									onPress={() => patch({ action })}
									style={[
										styles.filter,
										{
											backgroundColor: active ? c.primary : c.card,
											borderColor: active ? c.primary : c.border,
										},
									]}
									accessibilityRole="button"
									accessibilityLabel={t(activityLabelKey(action))}
									accessibilityState={{ selected: active }}
								>
									<Text
										style={[
											styles.filterText,
											{ color: active ? "#fff" : c.body },
										]}
									>
										{t(activityLabelKey(action))}
									</Text>
								</Pressable>
							);
						})}
					</ScrollView>

					{activity.isError && rows.length === 0 ? (
						<EmptyState
							illustration="notFound"
							title={t("shopActivity.errorTitle")}
							subtitle={t("shopActivity.errorBody")}
							ctaLabel={t("common.retry")}
							onCta={() => activity.refetch()}
						/>
					) : rows.length === 0 ? (
						<EmptyState
							illustration="empty"
							title={t("shopActivity.emptyTitle")}
							subtitle={t("shopActivity.emptyBody")}
						/>
					) : (
						<FlashList
							data={rows}
							keyExtractor={(row) => row.id}
							contentContainerStyle={styles.list}
							ItemSeparatorComponent={() => <View style={styles.separator} />}
							renderItem={({ item }) => (
								<ActivityRow entry={item} role={role} />
							)}
							onEndReached={() => {
								if (activity.hasNextPage) activity.fetchNextPage();
							}}
							onEndReachedThreshold={0.5}
							refreshControl={
								<RefreshControl
									refreshing={activity.isRefetching}
									onRefresh={() => activity.refetch()}
									tintColor={c.primary}
								/>
							}
							ListFooterComponent={
								activity.isFetchingNextPage ? (
									<ActivityIndicator
										color={c.primary}
										style={styles.footerSpinner}
									/>
								) : null
							}
						/>
					)}
				</>
			)}
		</SafeAreaView>
	);
}

const styles = StyleSheet.create({
	safe: { flex: 1 },
	center: { flex: 1, alignItems: "center", justifyContent: "center" },
	filtersScroll: { flexGrow: 0 },
	filters: { gap: 8, paddingHorizontal: 16, paddingVertical: 12 },
	filter: {
		borderRadius: 999,
		borderWidth: 1,
		paddingHorizontal: 14,
		minHeight: 44,
		justifyContent: "center",
	},
	filterText: { fontSize: 13, fontFamily: Fonts.bodySemibold },
	list: { padding: 16, paddingBottom: 40 },
	separator: { height: 10 },
	footerSpinner: { marginVertical: 16 },
});
