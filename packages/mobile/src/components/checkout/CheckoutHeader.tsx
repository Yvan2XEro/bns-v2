import { StyleSheet, Text, View } from "react-native";
import { Fonts } from "@/constants/theme";
import { SellerHeader } from "@/src/components/shop/SellerHeader";
import { useShopTheme } from "@/src/components/shop/theme";
import { useCart } from "@/src/hooks/useCart";
import { isSplitCart } from "@/src/lib/checkoutGroupFlow";
import { useTranslation } from "@/src/lib/i18n";
import { useCheckoutFlow } from "./CheckoutProvider";

export type CheckoutStep = "address" | "delivery" | "review" | "pay";

const LABELS: Record<CheckoutStep, string> = {
	address: "checkout.stepAddress",
	delivery: "checkout.stepDelivery",
	review: "checkout.stepReview",
	pay: "checkout.stepPay",
};

/**
 * The steps this buyer will actually walk: a split cart picks delivery inside
 * the review, and a protected payment adds the pay screen after it.
 */
export function checkoutSteps(split: boolean, paysNow: boolean) {
	const steps: { key: CheckoutStep; label: string }[] = split
		? [
				{ key: "address", label: LABELS.address },
				{ key: "review", label: "checkout.stepDeliveryReview" },
			]
		: [
				{ key: "address", label: LABELS.address },
				{ key: "delivery", label: LABELS.delivery },
				{ key: "review", label: LABELS.review },
			];
	if (paysNow) steps.push({ key: "pay", label: LABELS.pay });
	return steps;
}

/** The shared header plus "step n of N" and the step names. */
export function CheckoutHeader({ current }: { current: CheckoutStep }) {
	const cart = useCart();
	const { state } = useCheckoutFlow();
	const split = cart.data ? isSplitCart(cart.data) : false;
	return (
		<CheckoutStepsHeader
			current={current}
			steps={checkoutSteps(split, state.paymentMethod === "mobile_money")}
		/>
	);
}

/** The header itself, for a screen that knows its steps without the flow. */
export function CheckoutStepsHeader({
	current,
	steps,
}: {
	current: CheckoutStep;
	steps: { key: CheckoutStep; label: string }[];
}) {
	const c = useShopTheme();
	const { t } = useTranslation();
	const index = Math.max(
		0,
		steps.findIndex((step) => step.key === current),
	);
	const currentLabel = steps[index] ? t(steps[index].label) : "";
	const stepOf = t("checkout.stepOf", {
		current: index + 1,
		total: steps.length,
	});

	return (
		<View>
			<SellerHeader title={t("checkout.title")} subtitle={stepOf} />
			{/* One element for a screen reader: where the buyer is, not a list. */}
			<View
				style={[styles.steps, { borderBottomColor: c.border }]}
				accessible
				accessibilityRole="progressbar"
				accessibilityLabel={`${stepOf}, ${currentLabel}`}
				accessibilityValue={{ min: 1, max: steps.length, now: index + 1 }}
			>
				{steps.map(({ key, label }, position) => {
					const reached = position <= index;
					return (
						<View key={key} style={styles.step}>
							<View
								style={[
									styles.bar,
									{ backgroundColor: reached ? c.primary : c.border },
								]}
							/>
							<Text
								style={[
									styles.label,
									{
										color: reached ? c.link : c.muted,
										fontFamily:
											position === index ? Fonts.bodySemibold : Fonts.body,
									},
								]}
								numberOfLines={1}
							>
								{position + 1}. {t(label)}
							</Text>
						</View>
					);
				})}
			</View>
		</View>
	);
}

const styles = StyleSheet.create({
	steps: {
		flexDirection: "row",
		gap: 8,
		paddingHorizontal: 16,
		paddingTop: 4,
		paddingBottom: 10,
		borderBottomWidth: StyleSheet.hairlineWidth,
	},
	step: { flex: 1, gap: 6 },
	bar: { height: 4, borderRadius: 2 },
	label: { fontFamily: Fonts.body, fontSize: 13, lineHeight: 18 },
});
