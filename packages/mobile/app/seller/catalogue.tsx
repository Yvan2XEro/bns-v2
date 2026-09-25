import { Ionicons } from "@expo/vector-icons";
import { FlashList } from "@shopify/flash-list";
import { router, useLocalSearchParams } from "expo-router";
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
import { CatalogueRowItem } from "@/src/components/seller/CatalogueRowItem";
import { SellerHeader } from "@/src/components/shop/SellerHeader";
import { useShopTheme } from "@/src/components/shop/theme";
import { useCatalogueStepper } from "@/src/hooks/useCatalogueStepper";
import { useCatalogue, useMyShop } from "@/src/hooks/useShops";
import { formatDate } from "@/src/lib/formatDate";
import { useTranslation } from "@/src/lib/i18n";
import type { CatalogueFilter, CatalogueRow } from "@/src/types/api";

const FILTERS: CatalogueFilter[] = ["all", "low", "draft", "out"];

function isCatalogueFilter(value: unknown): value is CatalogueFilter {
	return typeof value === "string" && (FILTERS as string[]).includes(value);
}

export default function CatalogueScreen() {
	const c = useShopTheme();
	const { t, i18n } = useTranslation();
	const params = useLocalSearchParams<{ filter?: string }>();
	const filter: CatalogueFilter = isCatalogueFilter(params.filter)
		? params.filter
		: "all";

	const mine = useMyShop();
	const shop = mine.data?.shop;
	const catalogue = useCatalogue(shop?.id, filter);
	const readOnly = shop?.status !== "active";
	const { stepState, step } = useCatalogueStepper(shop?.id, filter);

	const counts = catalogue.data?.counts;
	const countFor = (f: CatalogueFilter) =>
		!counts
			? null
			: f === "all"
				? counts.all
				: f === "low"
					? counts.low
					: f === "draft"
						? counts.draft
						: counts.out;

	const rows = catalogue.data?.docs ?? [];
	const offline = catalogue.isError && Boolean(catalogue.data);

	return (
		<SafeAreaView
			edges={["top"]}
			style={[styles.safe, { backgroundColor: c.bg }]}
		>
			<SellerHeader
				title={t("catalogue.title")}
				subtitle={
					counts ? t("catalogue.productsCount", { count: counts.all }) : null
				}
				right={
					readOnly ? undefined : (
						<Pressable
							onPress={() => router.push("/seller/product/new" as never)}
							style={[styles.addBtn, { backgroundColor: c.sell }]}
							accessibilityRole="button"
							accessibilityLabel={t("catalogue.addProduct")}
						>
							<Ionicons name="add" size={18} color="#fff" />
						</Pressable>
					)
				}
			/>

			<ScrollView
				horizontal
				showsHorizontalScrollIndicator={false}
				style={styles.filtersScroll}
				contentContainerStyle={styles.filters}
			>
				{FILTERS.map((f) => {
					const active = f === filter;
					const count = countFor(f);
					return (
						<Pressable
							key={f}
							onPress={() => router.setParams({ filter: f })}
							style={[
								styles.filter,
								{
									backgroundColor: active ? c.primary : c.card,
									borderColor: active ? c.primary : c.border,
								},
							]}
							accessibilityRole="button"
							accessibilityLabel={t(`catalogue.filter_${f}`)}
							accessibilityState={{ selected: active }}
						>
							<Text
								style={[styles.filterText, { color: active ? "#fff" : c.body }]}
							>
								{t(`catalogue.filter_${f}`)}
								{count !== null ? ` ${count}` : ""}
							</Text>
						</Pressable>
					);
				})}
			</ScrollView>

			{offline ? (
				<View style={[styles.offline, { backgroundColor: c.warningSoft }]}>
					<Ionicons
						name="cloud-offline-outline"
						size={16}
						color={c.warningText}
					/>
					<Text style={[styles.offlineText, { color: c.warningText }]}>
						{t("catalogue.offline", {
							date: formatDate(
								catalogue.dataUpdatedAt,
								{
									day: "numeric",
									month: "short",
									hour: "2-digit",
									minute: "2-digit",
								},
								i18n.language?.startsWith("en") ? "en-GB" : "fr-FR",
							),
						})}
					</Text>
				</View>
			) : null}

			{catalogue.isLoading || mine.isLoading ? (
				<View style={styles.center}>
					<ActivityIndicator color={c.primary} />
					<Text style={[styles.meta, { color: c.muted }]}>
						{t("catalogue.loading")}
					</Text>
				</View>
			) : catalogue.isError && !catalogue.data ? (
				<EmptyState
					illustration="notFound"
					title={t("catalogue.errorTitle")}
					subtitle={t("catalogue.errorBody")}
					ctaLabel={t("common.retry")}
					onCta={() => catalogue.refetch()}
				/>
			) : rows.length === 0 && filter === "all" ? (
				<View style={{ flex: 1 }}>
					<EmptyState
						illustration="sell"
						title={t("catalogue.emptyTitle")}
						subtitle={t("catalogue.emptyBody")}
						ctaLabel={readOnly ? undefined : t("catalogue.addProduct")}
						onCta={() => router.push("/seller/product/new" as never)}
					/>
					{!readOnly ? (
						<Pressable
							onPress={() => router.push("/shop/move-listings" as never)}
							style={styles.secondary}
							accessibilityRole="button"
							accessibilityLabel={t("catalogue.moveListings")}
						>
							<Text style={[styles.secondaryText, { color: c.primary }]}>
								{t("catalogue.moveListings")}
							</Text>
						</Pressable>
					) : null}
				</View>
			) : (
				<FlashList
					data={rows}
					keyExtractor={(row) => row.id}
					contentContainerStyle={{ padding: 16, paddingBottom: 40 }}
					refreshControl={
						<RefreshControl
							refreshing={catalogue.isRefetching}
							onRefresh={() => catalogue.refetch()}
							tintColor={c.primary}
						/>
					}
					ItemSeparatorComponent={() => <View style={{ height: 10 }} />}
					ListEmptyComponent={
						<Text
							style={[
								styles.meta,
								{ color: c.muted, textAlign: "center", marginTop: 24 },
							]}
						>
							{t("catalogue.filterEmpty")}
						</Text>
					}
					ListFooterComponent={
						offline ? (
							<Text
								style={[styles.meta, { color: c.muted, textAlign: "center" }]}
							>
								{t("catalogue.offlineFooter")}
							</Text>
						) : null
					}
					renderItem={({ item }) => {
						const rowStep = stepState[item.id];
						const pending = rowStep?.pending ?? 0;
						const displayRow: CatalogueRow =
							pending === 0
								? item
								: { ...item, stockOnHand: item.stockOnHand + pending };
						return (
							<CatalogueRowItem
								row={displayRow}
								onPress={() =>
									router.push(`/seller/product/${item.id}` as never)
								}
								onStep={(delta) => step(item, delta)}
								stepping={rowStep?.committing ?? false}
								disabled={readOnly || offline}
							/>
						);
					}}
				/>
			)}
		</SafeAreaView>
	);
}

const styles = StyleSheet.create({
	safe: { flex: 1 },
	center: { flex: 1, alignItems: "center", justifyContent: "center", gap: 8 },
	meta: { fontSize: 13, fontFamily: Fonts.body },
	addBtn: {
		width: 44,
		height: 44,
		borderRadius: 10,
		alignItems: "center",
		justifyContent: "center",
	},
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
	offline: {
		flexDirection: "row",
		alignItems: "center",
		gap: 8,
		marginHorizontal: 16,
		padding: 10,
		borderRadius: 10,
	},
	offlineText: { flex: 1, fontSize: 12, fontFamily: Fonts.bodySemibold },
	secondary: {
		alignSelf: "center",
		padding: 12,
		marginBottom: 40,
		minHeight: 44,
		justifyContent: "center",
	},
	secondaryText: { fontSize: 14, fontFamily: Fonts.bodySemibold },
});
