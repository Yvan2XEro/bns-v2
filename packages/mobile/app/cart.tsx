import { FlashList } from "@shopify/flash-list";
import { router } from "expo-router";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Fonts } from "@/constants/theme";
import { CartLineRow } from "@/src/components/cart/CartLineRow";
import { CartSummary } from "@/src/components/cart/CartSummary";
import { useAppLocale } from "@/src/components/checkout/CheckoutProvider";
import { EmptyState } from "@/src/components/EmptyState";
import { SellerHeader } from "@/src/components/shop/SellerHeader";
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
import type { CartLineView } from "@/src/types/order";

export default function CartScreen() {
	const c = useShopTheme();
	const { t } = useTranslation();
	const locale = useAppLocale();
	const { user } = useAuth();
	const { ordersEnabled } = useAppConfig();
	const { showError } = useAlert();
	const cart = useCart();
	const setQuantity = useSetCartItemQuantity();
	const remove = useRemoveCartItem();
	const busy = setQuantity.isPending || remove.isPending;
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
					<Text style={[styles.shop, { color: c.text }]}>
						{t("cart.shopHeader", { shop: cart.data.shop.name })}
					</Text>
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
			<SellerHeader title={t("cart.title")} />
			{body}
		</SafeAreaView>
	);
}

const styles = StyleSheet.create({
	safe: { flex: 1 },
	list: { padding: 16 },
	shop: { fontSize: 16, fontFamily: Fonts.displayBold, marginBottom: 12 },
});
