import { Ionicons } from "@expo/vector-icons";
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
import { useSupplierResaleProducts } from "@/src/hooks/useResale";
import { useTranslation } from "@/src/lib/i18n";
import { formatXaf } from "@/src/lib/orderMoney";
import type { SupplierResaleProduct } from "../../../../api/src/contracts/resale";

export default function ResaleOfferedScreen() {
	const c = useShopTheme();
	const { t } = useTranslation();
	const { shop, isLoading: shopLoading } = useActiveShop();
	const offered = useSupplierResaleProducts(shop?.shopId);
	const rows = offered.data?.products ?? [];

	if (shopLoading || !shop) {
		return (
			<SafeAreaView style={[styles.safe, { backgroundColor: c.bg }]}>
				<ActivityIndicator style={styles.spinner} color={c.primary} />
			</SafeAreaView>
		);
	}
	return (
		<SafeAreaView style={[styles.safe, { backgroundColor: c.bg }]}>
			<SellerHeader
				title={t("sellerResale.offeredTitle")}
				subtitle={shop.name}
			/>
			<View style={styles.nav}>
				<Pressable
					accessibilityRole="button"
					accessibilityLabel={t("sellerResale.catalogueTitle")}
					onPress={() => router.push("/seller/resale/catalogue")}
					style={[
						styles.navButton,
						{ borderColor: c.border, backgroundColor: c.card },
					]}
				>
					<Text style={[styles.navText, { color: c.primary }]}>
						{t("sellerResale.catalogueTitle")}
					</Text>
					<Ionicons name="chevron-forward" size={16} color={c.primary} />
				</Pressable>
				<Pressable
					accessibilityRole="button"
					accessibilityLabel={t("sellerResale.purchaseOrdersLink")}
					onPress={() => router.push("/seller/resale/purchase-orders")}
					style={[
						styles.navButton,
						{ borderColor: c.border, backgroundColor: c.card },
					]}
				>
					<Text style={[styles.navText, { color: c.primary }]}>
						{t("sellerResale.purchaseOrdersLink")}
					</Text>
					<Ionicons name="chevron-forward" size={16} color={c.primary} />
				</Pressable>
			</View>
			{offered.isPending ? (
				<ActivityIndicator style={styles.spinner} color={c.primary} />
			) : null}
			{offered.isError ? (
				<EmptyState
					illustration="notFound"
					title={t("sellerResale.offeredLoadError")}
					ctaLabel={t("common.retry")}
					onCta={() => offered.refetch()}
				/>
			) : null}
			{offered.data && rows.length === 0 ? (
				<EmptyState
					illustration="empty"
					title={t("sellerResale.offeredEmpty")}
				/>
			) : null}
			<FlashList
				data={rows}
				keyExtractor={(item) => item.productId}
				contentContainerStyle={styles.list}
				ItemSeparatorComponent={() => <View style={{ height: 12 }} />}
				renderItem={({ item }) => <OfferedProductCard product={item} />}
			/>
		</SafeAreaView>
	);
}

function OfferedProductCard({ product }: { product: SupplierResaleProduct }) {
	const c = useShopTheme();
	const { t } = useTranslation();
	return (
		<View
			style={[styles.card, { borderColor: c.border, backgroundColor: c.card }]}
		>
			<View style={styles.heading}>
				<View style={styles.flex}>
					<Text style={[styles.title, { color: c.text }]}>{product.title}</Text>
					<Text style={[styles.meta, { color: c.muted }]}>
						{t("sellerResale.offeredStats", {
							resellers: product.resellerCount,
							units: product.unitsDelivered30d,
						})}
					</Text>
				</View>
				<Pressable
					accessibilityRole="button"
					accessibilityLabel={t("sellerResale.offeredEdit")}
					onPress={() =>
						router.push({
							pathname: "/seller/product/[id]",
							params: { id: product.productId },
						})
					}
					style={[styles.edit, { backgroundColor: c.primary }]}
				>
					<Text style={styles.editText}>{t("common.edit")}</Text>
				</Pressable>
			</View>
			{product.pendingEffectiveAt ? (
				<Text style={[styles.pending, { color: c.primary }]}>
					{t("sellerResale.offeredPending", {
						date: new Intl.DateTimeFormat(undefined, {
							dateStyle: "medium",
						}).format(new Date(product.pendingEffectiveAt)),
					})}
				</Text>
			) : null}
			{product.variants.map((variant) => (
				<View
					key={variant.id}
					style={[styles.variant, { borderTopColor: c.border }]}
				>
					<Text style={[styles.variantTitle, { color: c.text }]}>
						{variant.sku || t("sellerResale.offeredDefaultVariant")}
					</Text>
					<PriceLine
						label={t("sellerResale.offeredSupplierPrice")}
						value={variant.supplierPrice}
					/>
					<PriceLine
						label={t("sellerResale.offeredMinimum")}
						value={variant.minRetailPrice}
					/>
					<PriceLine
						label={t("sellerResale.offeredSuggested")}
						value={variant.suggestedRetailPrice}
					/>
				</View>
			))}
		</View>
	);
}

function PriceLine({ label, value }: { label: string; value: number | null }) {
	const c = useShopTheme();
	const { i18n } = useTranslation();
	const locale = i18n.language?.startsWith("en") ? "en" : "fr";
	return (
		<View style={styles.priceLine}>
			<Text style={[styles.meta, { color: c.muted }]}>{label}</Text>
			<Text style={[styles.price, { color: c.text }]}>
				{value === null ? "—" : formatXaf(value, locale)}
			</Text>
		</View>
	);
}

const styles = StyleSheet.create({
	safe: { flex: 1 },
	spinner: { margin: 24 },
	nav: { flexDirection: "row", gap: 8, paddingHorizontal: 16, paddingTop: 8 },
	navButton: {
		flex: 1,
		minHeight: 44,
		flexDirection: "row",
		alignItems: "center",
		justifyContent: "space-between",
		borderWidth: 1,
		borderRadius: 12,
		paddingHorizontal: 10,
	},
	navText: { flexShrink: 1, fontFamily: Fonts.bodyMedium, fontSize: 12 },
	list: { padding: 16 },
	card: { borderWidth: 1, borderRadius: 18, padding: 16, gap: 12 },
	heading: { flexDirection: "row", alignItems: "center", gap: 12 },
	flex: { flex: 1 },
	title: { fontFamily: Fonts.displaySemibold, fontSize: 17 },
	meta: { fontFamily: Fonts.body, fontSize: 12, marginTop: 4 },
	edit: {
		minHeight: 44,
		justifyContent: "center",
		borderRadius: 10,
		paddingHorizontal: 14,
	},
	editText: { color: "#fff", fontFamily: Fonts.bodyMedium, fontSize: 13 },
	pending: { fontFamily: Fonts.bodyMedium, fontSize: 12 },
	variant: { borderTopWidth: StyleSheet.hairlineWidth, paddingTop: 10, gap: 6 },
	variantTitle: { fontFamily: Fonts.bodyMedium, fontSize: 13 },
	priceLine: {
		flexDirection: "row",
		alignItems: "center",
		justifyContent: "space-between",
		gap: 12,
	},
	price: { fontFamily: Fonts.bodyMedium, fontSize: 13 },
});
