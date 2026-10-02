import { Redirect, router } from "expo-router";
import type { ReactNode } from "react";
import { ActivityIndicator, View } from "react-native";
import { EmptyState } from "@/src/components/EmptyState";
import { useShopTheme } from "@/src/components/shop/theme";
import { useAppConfig } from "@/src/contexts/AppConfigContext";
import { useCart } from "@/src/hooks/useCart";
import { useTranslation } from "@/src/lib/i18n";
import { useCheckoutFlow } from "./CheckoutProvider";

/**
 * What every step checks before rendering: ordering is open, there is a cart
 * to order, and the steps before this one were filled in (a deep link or a
 * restored screen can land mid-flow with an empty reducer).
 */
export function CheckoutGate({
	needs = "nothing",
	children,
}: {
	needs?: "nothing" | "address" | "option";
	children: ReactNode;
}) {
	const c = useShopTheme();
	const { t } = useTranslation();
	const { ordersEnabled } = useAppConfig();
	const cart = useCart();
	const { state, place } = useCheckoutFlow();

	// Placement empties the cart before the confirmation screen has loaded.
	if (cart.isPending || place.isSuccess) {
		return (
			<View style={{ flex: 1, justifyContent: "center" }}>
				<ActivityIndicator color={c.primary} />
			</View>
		);
	}
	if (!ordersEnabled) {
		return (
			<EmptyState illustration="notFound" title={t("checkout.ordersClosed")} />
		);
	}
	if (!cart.data || cart.data.lines.length === 0) {
		return (
			<EmptyState
				illustration="empty"
				title={t("checkout.emptyCart")}
				ctaLabel={t("checkout.goToCart")}
				onCta={() => router.replace("/cart")}
			/>
		);
	}
	if (needs !== "nothing" && !state.address) {
		return <Redirect href="/checkout/address" />;
	}
	if (needs === "option" && !state.option) {
		return <Redirect href="/checkout/delivery" />;
	}
	return <>{children}</>;
}
