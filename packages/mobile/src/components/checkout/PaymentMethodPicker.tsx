import { Ionicons } from "@expo/vector-icons";
import {
	Pressable,
	StyleSheet,
	Text,
	useWindowDimensions,
	View,
} from "react-native";
import { Fonts } from "@/constants/theme";
import { useShopTheme } from "@/src/components/shop/theme";
import type { BuyerProtectionConfig } from "@/src/contexts/AppConfigContext";
import { useTranslation } from "@/src/lib/i18n";
import { formatPrice } from "@/src/lib/market";
import type { PaymentMethod } from "@/src/types/order";
import { inkOf } from "./fill";

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
	// Two columns of three-line copy are hard to compare on a 360dp phone in
	// daylight; under 400dp the options stack.
	const narrow = useWindowDimensions().width < 400;

	return (
		<View
			style={[styles.card, { borderColor: c.border, backgroundColor: c.card }]}
			accessibilityRole="radiogroup"
			accessibilityLabel={t("payments.method_title")}
		>
			<Text
				style={[styles.legend, { color: c.text }]}
				accessibilityRole="header"
			>
				{t("payments.method_title")}
			</Text>
			<View style={[styles.options, narrow && styles.optionsStacked]}>
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
							style={({ pressed }) => [
								styles.option,
								{
									borderColor: active ? c.primary : c.border,
									backgroundColor: active ? c.primarySoft : c.card,
									opacity: pressed ? 0.85 : 1,
								},
							]}
						>
							<View style={styles.optionHead}>
								<Ionicons
									name={
										isProtected ? "shield-checkmark-outline" : "cash-outline"
									}
									size={18}
									color={active ? inkOf(c) : c.body}
								/>
								<Ionicons
									name={active ? "radio-button-on" : "radio-button-off"}
									size={20}
									color={active ? inkOf(c) : c.muted}
								/>
							</View>
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
								<Text style={[styles.optionFee, { color: inkOf(c) }]}>
									{fee !== null
										? t("payments.method_protectedFee", {
												fee: formatPrice(fee, locale),
											})
										: t("payments.disclosure_listingBadge", {
												rate: buyerProtection.bps / 100,
												min: formatPrice(buyerProtection.min, locale),
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
		padding: 16,
		gap: 12,
	},
	legend: { fontSize: 18, lineHeight: 23, fontFamily: Fonts.displayBold },
	options: { flexDirection: "row", gap: 10 },
	optionsStacked: { flexDirection: "column" },
	option: {
		flexGrow: 1,
		flexBasis: 0,
		minHeight: 48,
		borderWidth: 1.5,
		borderRadius: 12,
		padding: 12,
		gap: 4,
	},
	optionHead: {
		flexDirection: "row",
		justifyContent: "space-between",
		alignItems: "center",
		marginBottom: 2,
	},
	optionTitle: { fontSize: 15, fontFamily: Fonts.bodySemibold },
	optionBody: { fontSize: 13, lineHeight: 18, fontFamily: Fonts.body },
	optionFee: { fontSize: 13, lineHeight: 18, fontFamily: Fonts.bodySemibold },
});
