import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { StyleSheet, Text, View } from "react-native";
import { Fonts } from "@/constants/theme";
import { useShopTheme } from "@/src/components/shop/theme";
import { useTranslation } from "@/src/lib/i18n";
import type { OrderView, PaymentStatus } from "@/src/types/order";
import { CheckoutButton } from "../checkout/CheckoutButton";

const PAYABLE_STATUSES = new Set<PaymentStatus>(["unpaid", "awaiting_payment"]);
const REFUND_STATUSES = new Set<PaymentStatus>([
	"refunded",
	"partially_refunded",
]);

/**
 * The order's own payment facts, mirroring web's `payment-section.tsx`:
 * nothing here is an order action — accepting or declining a `paid` order is
 * `orderActions.ts`'s own row, untouched by this screen. A COD order shows
 * nothing at all.
 */
export function PaymentSection({ order }: { order: OrderView }) {
	const c = useShopTheme();
	const { t } = useTranslation();

	if (order.paymentMethod !== "mobile_money") return null;

	const payable =
		order.status === "placed" && PAYABLE_STATUSES.has(order.paymentStatus);
	const refunding = REFUND_STATUSES.has(order.paymentStatus);

	return (
		<View
			style={[styles.card, { backgroundColor: c.card, borderColor: c.border }]}
		>
			<Text
				style={[styles.title, { color: c.text }]}
				accessibilityRole="header"
			>
				{t("payments.order_paymentTitle")}
			</Text>
			{payable ? (
				<CheckoutButton
					label={t("payments.pay_title")}
					onPress={() =>
						router.push({
							pathname: "/checkout/[orderId]/pay",
							params: { orderId: order.id },
						})
					}
				/>
			) : null}
			{order.paymentStatus === "paid" ? (
				<View style={styles.line}>
					<Ionicons
						name="shield-checkmark"
						size={18}
						color={c.successText}
						style={styles.icon}
					/>
					<Text style={[styles.note, styles.flex, { color: c.successText }]}>
						{t("payments.order_paidProtected")}
					</Text>
				</View>
			) : null}
			{refunding ? (
				<View style={{ gap: 2 }}>
					<Text style={[styles.subtitle, { color: c.text }]}>
						{t("payments.order_refundsTitle")}
					</Text>
					{/* The 5-7 business-day window is the spec's own commitment, not
					    a configurable AppSettings value, so it is not read off any config. */}
					<Text style={[styles.note, { color: c.muted }]}>
						{t("payments.order_refundDelay", { days: "5–7" })}
					</Text>
				</View>
			) : null}
		</View>
	);
}

const styles = StyleSheet.create({
	card: {
		borderWidth: StyleSheet.hairlineWidth,
		borderRadius: 16,
		padding: 16,
		gap: 12,
	},
	title: { fontSize: 18, lineHeight: 23, fontFamily: Fonts.displayBold },
	subtitle: { fontSize: 15, fontFamily: Fonts.bodySemibold },
	note: { fontSize: 14, lineHeight: 20, fontFamily: Fonts.body },
	line: { flexDirection: "row", gap: 8, alignItems: "flex-start" },
	icon: { marginTop: 1 },
	flex: { flex: 1 },
});
