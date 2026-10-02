import { Ionicons } from "@expo/vector-icons";
import { router, useLocalSearchParams } from "expo-router";
import {
	ActivityIndicator,
	ScrollView,
	StyleSheet,
	Text,
	View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Fonts } from "@/constants/theme";
import { CheckoutButton } from "@/src/components/checkout/CheckoutButton";
import { useAppLocale } from "@/src/components/checkout/CheckoutProvider";
import { CodeEntry } from "@/src/components/checkout/CodeEntry";
import { EmptyState } from "@/src/components/EmptyState";
import { SellerHeader } from "@/src/components/shop/SellerHeader";
import { useShopTheme } from "@/src/components/shop/theme";
import { usePurchase } from "@/src/hooks/usePurchases";
import { resolveErrorMessage } from "@/src/lib/apiError";
import {
	confirmationOutcome,
	isConfirmationRequired,
} from "@/src/lib/checkoutFlow";
import { useTranslation } from "@/src/lib/i18n";
import { formatXaf } from "@/src/lib/orderMoney";

/**
 * `c` carries the placement's `confirmationRequired`, so the right outcome
 * renders before the order loads; the order's own `confirmation.required`
 * takes over once it has, so a confirmed code moves the screen on.
 */
export default function CheckoutConfirmationScreen() {
	const { id, c: hint } = useLocalSearchParams<{ id: string; c?: string }>();
	const c = useShopTheme();
	const { t } = useTranslation();
	const locale = useAppLocale();
	const purchase = usePurchase(id);
	const order = purchase.data;
	const outcome = confirmationOutcome(
		order?.confirmation.required ??
			(isConfirmationRequired(hint) ? hint : null),
	);
	const leave = () => router.replace("/(tabs)/home");

	return (
		<SafeAreaView edges={["top"]} style={{ flex: 1, backgroundColor: c.bg }}>
			<SellerHeader title={t("checkout.title")} icon="close" onBack={leave} />
			{purchase.isPending ? (
				<ActivityIndicator style={{ marginTop: 40 }} color={c.primary} />
			) : !order ? (
				<EmptyState
					illustration="notFound"
					title={resolveErrorMessage(purchase.error, t)}
					ctaLabel={t("common.retry")}
					onCta={() => void purchase.refetch()}
				/>
			) : (
				<ScrollView contentContainerStyle={{ padding: 16, gap: 16 }}>
					<View style={styles.hero}>
						<Ionicons
							name={outcome === "confirmed" ? "checkmark-circle" : "call"}
							size={56}
							color={outcome === "confirmed" ? c.success : c.primary}
						/>
						<Text style={[styles.title, { color: c.text }]}>
							{t("checkout.orderReceived", { number: order.orderNumber })}
						</Text>
						<Text style={[styles.meta, { color: c.body }]}>
							{t("checkout.total")}
						</Text>
						<Text style={[styles.total, { color: c.text }]}>
							{formatXaf(order.amounts.total, locale)}
						</Text>
					</View>
					<View
						style={[
							styles.card,
							{ backgroundColor: c.card, borderColor: c.border },
						]}
					>
						{outcome === "confirmed" ? (
							<>
								<Text style={[styles.heading, { color: c.successText }]}>
									{t("checkout.confirmed")}
								</Text>
								<Text style={[styles.meta, { color: c.body }]}>
									{order.confirmation.method === "verified_phone"
										? t("checkout.autoConfirmedBody")
										: t("checkout.confirmedBody")}
								</Text>
							</>
						) : null}
						{outcome === "seller_call" ? (
							<>
								<Text style={[styles.heading, { color: c.text }]}>
									{t("checkout.confirmationNeededCall")}
								</Text>
								<Text style={[styles.meta, { color: c.body }]}>
									{t("checkout.sellerCallBody")}
								</Text>
							</>
						) : null}
						{outcome === "code" ? (
							<>
								<Text style={[styles.heading, { color: c.text }]}>
									{t("checkout.confirmationNeededCode")}
								</Text>
								<CodeEntry
									order={order}
									onAttempt={() => void purchase.refetch()}
								/>
							</>
						) : null}
					</View>
					<CheckoutButton
						label={t("checkout.viewOrder")}
						onPress={() =>
							router.replace({
								pathname: "/purchases/[id]",
								params: { id: order.id },
							})
						}
					/>
					<CheckoutButton
						variant="outline"
						label={t("checkout.continueShopping")}
						onPress={leave}
					/>
				</ScrollView>
			)}
		</SafeAreaView>
	);
}

const styles = StyleSheet.create({
	hero: { alignItems: "center", gap: 6, paddingVertical: 8 },
	title: { fontSize: 20, fontFamily: Fonts.displayBold, textAlign: "center" },
	total: { fontSize: 22, fontFamily: Fonts.displayBold },
	heading: { fontSize: 16, fontFamily: Fonts.displayBold },
	meta: { fontSize: 14, fontFamily: Fonts.body },
	card: {
		borderWidth: StyleSheet.hairlineWidth,
		borderRadius: 16,
		padding: 14,
		gap: 8,
	},
});
