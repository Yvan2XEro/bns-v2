import { Pressable, StyleSheet, Text, View } from "react-native";
import { Fonts } from "@/constants/theme";
import { useShopTheme } from "@/src/components/shop/theme";
import type { BuyerProtectionConfig } from "@/src/contexts/AppConfigContext";
import { useTranslation } from "@/src/lib/i18n";
import { formatXaf } from "@/src/lib/orderMoney";
import type { PaymentMethod } from "@/src/types/order";

const METHODS: readonly PaymentMethod[] = ["cod", "mobile_money"];

/**
 * COD vs protected payment, shown only while `protectedPaymentEnabled` is
 * true (the caller decides that, never this component) — mirrors web's
 * `payment-method-picker.tsx`. `fee` is this order's own quoted buyer
 * protection fee, null until a mobile_money quote has actually answered; the
 * rate/min hint shown before that never reads a literal, only
 * `buyerProtection` off the public config.
 */
export function PaymentMethodPicker({
	method,
	fee,
	buyerProtection,
	locale,
	onChoose,
}: {
	method: PaymentMethod;
	fee: number | null;
	buyerProtection: BuyerProtectionConfig;
	locale: "fr" | "en";
	onChoose: (method: PaymentMethod) => void;
}) {
	const c = useShopTheme();
	const { t } = useTranslation();

	return (
		<View
			style={[styles.card, { borderColor: c.border }]}
			accessibilityRole="radiogroup"
			accessibilityLabel={t("payments.method_title")}
		>
			<Text style={[styles.legend, { color: c.text }]}>
				{t("payments.method_title")}
			</Text>
			<View style={styles.options}>
				{METHODS.map((option) => {
					const active = option === method;
					const isProtected = option === "mobile_money";
					return (
						<Pressable
							key={option}
							onPress={() => onChoose(option)}
							accessibilityRole="radio"
							accessibilityState={{ checked: active }}
							accessibilityLabel={t(
								isProtected
									? "payments.method_protected"
									: "payments.method_cod",
							)}
							style={[
								styles.option,
								{
									borderColor: active ? c.primary : c.border,
									backgroundColor: active ? c.primarySoft : c.card,
								},
							]}
						>
							<Text style={[styles.optionTitle, { color: c.text }]}>
								{t(
									isProtected
										? "payments.method_protected"
										: "payments.method_cod",
								)}
							</Text>
							<Text style={[styles.optionBody, { color: c.muted }]}>
								{t(
									isProtected
										? "payments.method_protectedBody"
										: "payments.method_codBody",
								)}
							</Text>
							{isProtected ? (
								<Text style={[styles.optionFee, { color: c.primary }]}>
									{fee !== null
										? t("payments.method_protectedFee", {
												fee: formatXaf(fee, locale),
											})
										: t("payments.disclosure_listingBadge", {
												rate: buyerProtection.bps / 100,
												min: buyerProtection.min,
											})}
								</Text>
							) : null}
						</Pressable>
					);
				})}
			</View>
		</View>
	);
}

const styles = StyleSheet.create({
	card: {
		borderWidth: StyleSheet.hairlineWidth,
		borderRadius: 16,
		padding: 14,
		gap: 10,
	},
	legend: { fontSize: 15, fontFamily: Fonts.displayBold },
	options: { flexDirection: "row", gap: 10 },
	option: {
		flex: 1,
		minHeight: 44,
		borderWidth: 1,
		borderRadius: 12,
		padding: 10,
		gap: 4,
	},
	optionTitle: { fontSize: 14, fontFamily: Fonts.bodySemibold },
	optionBody: { fontSize: 12, fontFamily: Fonts.body },
	optionFee: { fontSize: 12, fontFamily: Fonts.bodySemibold },
});
