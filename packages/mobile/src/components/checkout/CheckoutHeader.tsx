import { StyleSheet, Text, View } from "react-native";
import { Fonts } from "@/constants/theme";
import { SellerHeader } from "@/src/components/shop/SellerHeader";
import { useShopTheme } from "@/src/components/shop/theme";
import { useTranslation } from "@/src/lib/i18n";

const STEPS = [
	{ step: 1, label: "checkout.stepAddress" },
	{ step: 2, label: "checkout.stepDelivery" },
	{ step: 3, label: "checkout.stepReview" },
] as const;

/** The shared header plus "step n of 3" and the three step names. */
export function CheckoutHeader({ current }: { current: 1 | 2 | 3 }) {
	const c = useShopTheme();
	const { t } = useTranslation();

	return (
		<View>
			<SellerHeader
				title={t("checkout.title")}
				subtitle={t("checkout.stepOf", { current })}
			/>
			<View
				style={[styles.steps, { borderBottomColor: c.border }]}
				accessibilityRole="summary"
			>
				{STEPS.map(({ step, label }) => (
					<Text
						key={step}
						style={[
							styles.step,
							{
								color: step <= current ? c.primary : c.muted,
								fontFamily: step === current ? Fonts.bodySemibold : Fonts.body,
							},
						]}
						accessibilityState={{ selected: step === current }}
					>
						{t(label)}
					</Text>
				))}
			</View>
		</View>
	);
}

const styles = StyleSheet.create({
	steps: {
		flexDirection: "row",
		gap: 16,
		paddingHorizontal: 16,
		paddingVertical: 10,
		borderBottomWidth: StyleSheet.hairlineWidth,
	},
	step: { fontSize: 13 },
});
