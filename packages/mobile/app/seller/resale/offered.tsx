import { Ionicons } from "@expo/vector-icons";
import { FlashList } from "@shopify/flash-list";
import { router } from "expo-router";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Fonts } from "@/constants/theme";
import { EmptyState } from "@/src/components/EmptyState";
import { ScreenColumn } from "@/src/components/layout/ScreenColumn";
import { ListSkeleton } from "@/src/components/shop/ListSkeleton";
import { SellerHeader } from "@/src/components/shop/SellerHeader";
import { useShopTheme } from "@/src/components/shop/theme";
import { useActiveShop } from "@/src/hooks/useActiveShop";
import { useSupplierResaleProducts } from "@/src/hooks/useResale";
import {
	ERROR_CODES,
	hasErrorCode,
	resolveErrorMessage,
} from "@/src/lib/apiError";
import { useTranslation } from "@/src/lib/i18n";
import { formatPrice } from "@/src/lib/market";
import type { SupplierResaleProduct } from "../../../../api/src/contracts/resale";

export default function ResaleOfferedScreen() {
	const c = useShopTheme();
	const { t } = useTranslation();
	const { shop, isLoading: shopLoading } = useActiveShop();
	const offered = useSupplierResaleProducts(shop?.shopId);
	const rows = offered.data?.products ?? [];

	if (shopLoading || !shop) {
		return (
			<SafeAreaView
				edges={["top"]}
				style={[styles.safe, { backgroundColor: c.bg }]}
			>
				<SellerHeader title={t("sellerResale.offeredTitle")} />
				{shopLoading ? (
					<ListSkeleton />
				) : (
					<EmptyState illustration="sell" title={t("seller.noShopTitle")} />
				)}
			</SafeAreaView>
		);
	}
	return (
		<SafeAreaView
			edges={["top"]}
			style={[styles.safe, { backgroundColor: c.bg }]}
		>
			<SellerHeader
				title={t("sellerResale.offeredTitle")}
				subtitle={shop.name}
			/>
			<View style={styles.nav}>
				<Pressable
					accessibilityRole="button"
					accessibilityLabel={t("sellerResale.catalogueTitle")}
					onPress={() => router.push("/seller/resale/catalogue")}
					style={({ pressed }) => [
						styles.navButton,
						{ borderColor: c.border, backgroundColor: c.card },
						pressed && styles.pressed,
					]}
				>
					<Text style={[styles.navText, { color: c.link }]}>
						{t("sellerResale.catalogueTitle")}
					</Text>
					<Ionicons name="chevron-forward" size={16} color={c.link} />
				</Pressable>
				<Pressable
					accessibilityRole="button"
					accessibilityLabel={t("sellerResale.purchaseOrdersLink")}
					onPress={() => router.push("/seller/resale/purchase-orders")}
					style={({ pressed }) => [
						styles.navButton,
						{ borderColor: c.border, backgroundColor: c.card },
						pressed && styles.pressed,
					]}
				>
					<Text style={[styles.navText, { color: c.link }]}>
						{t("sellerResale.purchaseOrdersLink")}
					</Text>
					<Ionicons name="chevron-forward" size={16} color={c.link} />
				</Pressable>
			</View>
			{offered.isPending ? <ListSkeleton /> : null}
			{offered.isError ? (
				hasErrorCode(offered.error, ERROR_CODES.resaleDisabled) ? (
					<EmptyState
						illustration="empty"
						title={resolveErrorMessage(offered.error, t)}
					/>
				) : (
					<EmptyState
						illustration="notFound"
						title={t("sellerResale.offeredLoadError")}
						subtitle={resolveErrorMessage(offered.error, t)}
						ctaLabel={t("common.retry")}
						onCta={() => offered.refetch()}
					/>
				)
			) : null}
			{offered.data && rows.length === 0 ? (
				<EmptyState
					illustration="empty"
					title={t("sellerResale.offeredEmpty")}
				/>
			) : null}
			<ScreenColumn width="wide">
				<FlashList
					data={rows}
					keyExtractor={(item) => item.productId}
					contentContainerStyle={styles.list}
					ItemSeparatorComponent={() => <View style={{ height: 12 }} />}
					renderItem={({ item }) => <OfferedProductCard product={item} />}
				/>
			</ScreenColumn>
		</SafeAreaView>
	);
}

function OfferedProductCard({ product }: { product: SupplierResaleProduct }) {
	const c = useShopTheme();
	const { t, i18n } = useTranslation();
	return (
		<View
			style={[styles.card, { borderColor: c.border, backgroundColor: c.card }]}
		>
			<View style={styles.heading}>
				<View style={styles.flex}>
					<Text
						accessibilityRole="header"
						style={[styles.title, { color: c.text }]}
					>
						{product.title}
					</Text>
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
					hitSlop={{ top: 2, bottom: 2 }}
					style={({ pressed }) => [
						styles.edit,
						{ borderColor: c.border },
						pressed && styles.pressed,
					]}
				>
					<Ionicons name="create-outline" size={16} color={c.link} />
					<Text style={[styles.editText, { color: c.link }]}>
						{t("common.edit")}
					</Text>
				</Pressable>
			</View>
			{product.pendingEffectiveAt ? (
				<Text style={[styles.pending, { color: c.link }]}>
					{t("sellerResale.offeredPending", {
						date: new Intl.DateTimeFormat(i18n.language, {
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
				{value === null ? "—" : formatPrice(value, locale)}
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
		minHeight: 48,
		flexDirection: "row",
		alignItems: "center",
		justifyContent: "space-between",
		borderWidth: 1,
		borderRadius: 12,
		paddingHorizontal: 10,
	},
	navText: {
		flexShrink: 1,
		fontFamily: Fonts.bodySemibold,
		fontSize: 15,
		lineHeight: 22,
	},
	pressed: { opacity: 0.7 },
	list: { padding: 16, paddingBottom: 40 },
	card: {
		borderWidth: StyleSheet.hairlineWidth,
		borderRadius: 16,
		padding: 16,
		gap: 12,
	},
	heading: { flexDirection: "row", alignItems: "flex-start", gap: 12 },
	flex: { flex: 1, gap: 4 },
	title: { fontFamily: Fonts.displayBold, fontSize: 18, lineHeight: 26 },
	meta: { fontFamily: Fonts.body, fontSize: 13, lineHeight: 18 },
	edit: {
		minHeight: 44,
		flexDirection: "row",
		alignItems: "center",
		gap: 6,
		borderRadius: 12,
		borderWidth: StyleSheet.hairlineWidth,
		paddingHorizontal: 12,
	},
	editText: { fontFamily: Fonts.bodySemibold, fontSize: 15, lineHeight: 22 },
	pending: { fontFamily: Fonts.bodyMedium, fontSize: 13, lineHeight: 18 },
	variant: { borderTopWidth: StyleSheet.hairlineWidth, paddingTop: 12, gap: 6 },
	variantTitle: {
		fontFamily: Fonts.bodySemibold,
		fontSize: 15,
		lineHeight: 22,
	},
	priceLine: {
		flexDirection: "row",
		alignItems: "center",
		justifyContent: "space-between",
		gap: 12,
	},
	price: {
		fontFamily: Fonts.displaySemibold,
		fontSize: 15,
		lineHeight: 22,
		fontVariant: ["tabular-nums"],
	},
});
