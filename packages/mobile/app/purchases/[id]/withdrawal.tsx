import { router, useLocalSearchParams } from "expo-router";
import {
	ActivityIndicator,
	KeyboardAvoidingView,
	Platform,
	ScrollView,
	StyleSheet,
	Text,
	View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { EmptyState } from "@/src/components/EmptyState";
import { Card, purchaseText } from "@/src/components/purchases/ui";
import { WithdrawalForm } from "@/src/components/purchases/WithdrawalForm";
import { WithdrawalWindowNote } from "@/src/components/purchases/WithdrawalWindowNote";
import { SellerHeader } from "@/src/components/shop/SellerHeader";
import { useShopTheme } from "@/src/components/shop/theme";
import { useAlert } from "@/src/contexts/AlertContext";
import { useNow } from "@/src/hooks/useNow";
import { usePurchase } from "@/src/hooks/usePurchases";
import { resolveErrorMessage } from "@/src/lib/apiError";
import { useTranslation } from "@/src/lib/i18n";
import { availableActions } from "@/src/lib/orderActions";

/**
 * The return request as its own screen. Reached from the purchase's action
 * bar, but also by a back-stack or a stale link, so it asks the action list
 * itself rather than trusting how it was opened.
 */
export default function WithdrawalScreen() {
	const c = useShopTheme();
	const { t } = useTranslation();
	const { showSuccess } = useAlert();
	const { id } = useLocalSearchParams<{ id: string }>();
	const purchase = usePurchase(id);
	const now = useNow();
	const order = purchase.data;
	const offered = order
		? availableActions(order, "buyer", null, { now }).includes(
				"request_withdrawal",
			)
		: false;

	return (
		<SafeAreaView
			edges={["top"]}
			style={[styles.safe, { backgroundColor: c.bg }]}
		>
			<SellerHeader
				title={t("purchases.returnItem")}
				subtitle={
					order
						? t("purchases.orderNumber", { number: order.orderNumber })
						: null
				}
			/>
			{purchase.isPending ? (
				<View style={styles.center}>
					<ActivityIndicator color={c.primary} />
				</View>
			) : purchase.isError || !order ? (
				<EmptyState
					illustration="notFound"
					title={t("purchases.loadError")}
					subtitle={
						purchase.error ? resolveErrorMessage(purchase.error, t) : undefined
					}
					ctaLabel={t("purchases.retry")}
					onCta={() => void purchase.refetch()}
				/>
			) : (
				<KeyboardAvoidingView
					style={styles.safe}
					behavior={Platform.OS === "ios" ? "padding" : undefined}
				>
					<ScrollView
						contentContainerStyle={styles.content}
						keyboardShouldPersistTaps="handled"
					>
						<Card>
							<WithdrawalWindowNote order={order} now={now} />
							{offered ? null : (
								<Text style={[purchaseText.body, { color: c.body }]}>
									{t("purchases.withdrawalUnavailable")}
								</Text>
							)}
						</Card>
						{offered ? (
							<WithdrawalForm
								order={order}
								onSent={() => {
									showSuccess(t("purchases.withdrawalSent"));
									router.back();
								}}
							/>
						) : null}
					</ScrollView>
				</KeyboardAvoidingView>
			)}
		</SafeAreaView>
	);
}

const styles = StyleSheet.create({
	safe: { flex: 1 },
	center: { flex: 1, alignItems: "center", justifyContent: "center" },
	content: { padding: 16, gap: 14, paddingBottom: 48 },
});
