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
import { CartLineRow } from "@/src/components/cart/CartLineRow";
import {
	CartCheckoutBar,
	CartSummary,
} from "@/src/components/cart/CartSummary";
import { useAppLocale } from "@/src/components/checkout/CheckoutProvider";
import { EmptyState } from "@/src/components/EmptyState";
import { SellerHeader } from "@/src/components/shop/SellerHeader";
import { ShopAvatar } from "@/src/components/shop/ShopAvatar";
import { useShopTheme } from "@/src/components/shop/theme";
import { useAlert } from "@/src/contexts/AlertContext";
import { useAppConfig } from "@/src/contexts/AppConfigContext";
import {
	useCart,
	useRemoveCartItem,
	useSetCartItemQuantity,
} from "@/src/hooks/useCart";
import { resolveErrorMessage } from "@/src/lib/apiError";
import { useAuth } from "@/src/lib/auth";
import { useTranslation } from "@/src/lib/i18n";
import type { CartLineView, CartView } from "@/src/types/order";

export default function CartScreen() {
	const c = useShopTheme();
	const { t } = useTranslation();
	const locale = useAppLocale();
	const { user } = useAuth();
	const { ordersEnabled, launchCities } = useAppConfig();
	const { showError } = useAlert();
	const cart = useCart();
	const setQuantity = useSetCartItemQuantity();
	const remove = useRemoveCartItem();
	const busy = setQuantity.isPending || remove.isPending;
	const cityLabel = (key: string | null) =>
		launchCities.find((city) => city.key === key)?.label ?? null;
	const lines = cart.data?.lines ?? [];
	const itemCount = lines.reduce((sum, line) => sum + line.quantity, 0);
	const onError = (error: unknown) =>
		showError(t("cart.errorTitle"), resolveErrorMessage(error, t));

	const body = !ordersEnabled ? (
		<EmptyState illustration="notFound" title={t("cart.ordersClosed")} />
	) : !user ? (
		<EmptyState
			illustration="auth"
			title={t("cart.signInToView")}
			ctaLabel={t("auth.signIn")}
			onCta={() => router.push("/auth/login")}
		/>
	) : cart.isPending ? (
		<ActivityIndicator style={{ marginTop: 40 }} color={c.primary} />
	) : cart.isError ? (
		<EmptyState
			illustration="notFound"
			title={resolveErrorMessage(cart.error, t)}
			ctaLabel={t("common.retry")}
			onCta={() => void cart.refetch()}
		/>
	) : cart.data.lines.length === 0 ? (
		<EmptyState
			illustration="empty"
			title={t("cart.empty")}
			ctaLabel={t("cart.emptyCta")}
			onCta={() => router.replace("/(tabs)/home")}
		/>
	) : (
		<FlashList<CartLineView>
			data={cart.data.lines}
			keyExtractor={(line) => line.id}
			contentContainerStyle={styles.list}
			ItemSeparatorComponent={() => <View style={{ height: 10 }} />}
			ListHeaderComponent={
				cart.data.shop ? (
					<ShopRow shop={cart.data.shop} cityLabel={cityLabel} />
				) : null
			}
			renderItem={({ item }) => (
				<CartLineRow
					line={item}
					locale={locale}
					busy={busy}
					onQuantity={(quantity) =>
						setQuantity.mutate({ lineId: item.id, quantity }, { onError })
					}
					onRemove={() => remove.mutate(item.id, { onError })}
				/>
			)}
			ListFooterComponent={<CartSummary cart={cart.data} locale={locale} />}
		/>
	);

	return (
		<SafeAreaView
			edges={["top"]}
			style={[styles.safe, { backgroundColor: c.bg }]}
		>
			<SellerHeader
				title={t("cart.title")}
				subtitle={
					lines.length > 0
						? t("cart.headerSummary", { count: itemCount })
						: null
				}
			/>
			<View style={styles.body}>{body}</View>
			{ordersEnabled && user && cart.data && lines.length > 0 ? (
				<CartCheckoutBar cart={cart.data} locale={locale} />
			) : null}
		</SafeAreaView>
	);
}

function ShopRow({
	shop,
	cityLabel,
}: {
	shop: NonNullable<CartView["shop"]>;
	cityLabel: (key: string | null) => string | null;
}) {
	const c = useShopTheme();
	const { t } = useTranslation();
	const city = cityLabel(shop.city);
	return (
		<Pressable
			onPress={() => router.push(`/s/${shop.handle}` as never)}
			accessibilityRole="link"
			accessibilityLabel={t("cart.shopHeader", { shop: shop.name })}
			style={[styles.shop, { backgroundColor: c.card, borderColor: c.border }]}
		>
			<ShopAvatar name={shop.name} size={40} radius={12} />
			<View style={{ flex: 1 }}>
				<Text style={[styles.shopName, { color: c.text }]} numberOfLines={1}>
					{shop.name}
				</Text>
				{city ? (
					<Text style={[styles.shopMeta, { color: c.muted }]}>{city}</Text>
				) : null}
			</View>
			<Ionicons name="chevron-forward" size={16} color={c.muted} />
		</Pressable>
	);
}

const styles = StyleSheet.create({
	safe: { flex: 1 },
	body: { flex: 1 },
	list: { padding: 16 },
	shop: {
		flexDirection: "row",
		alignItems: "center",
		gap: 12,
		padding: 12,
		borderRadius: 16,
		borderWidth: 1,
		marginBottom: 10,
	},
	shopName: { fontSize: 15, fontFamily: Fonts.displayBold },
	shopMeta: { fontSize: 12, fontFamily: Fonts.body },
});
