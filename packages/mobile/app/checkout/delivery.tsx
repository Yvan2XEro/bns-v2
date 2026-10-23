import { Redirect, router } from "expo-router";
import { useState } from "react";
import { ActivityIndicator, ScrollView, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { CheckoutButton } from "@/src/components/checkout/CheckoutButton";
import { CheckoutGate } from "@/src/components/checkout/CheckoutGate";
import { CheckoutHeader } from "@/src/components/checkout/CheckoutHeader";
import {
	useAppLocale,
	useCheckoutFlow,
} from "@/src/components/checkout/CheckoutProvider";
import { DeliveryOptionCard } from "@/src/components/checkout/DeliveryOptionCard";
import { PaymentMethodPicker } from "@/src/components/checkout/PaymentMethodPicker";
import { ScreenColumn } from "@/src/components/layout/ScreenColumn";
import { formStyles } from "@/src/components/seller/formStyles";
import { useShopTheme } from "@/src/components/shop/theme";
import { useAppConfig } from "@/src/contexts/AppConfigContext";
import { useCart } from "@/src/hooks/useCart";
import { useDeliveryOptions } from "@/src/hooks/useCheckout";
import { resolveErrorMessage } from "@/src/lib/apiError";
import { landmarkMissingFor } from "@/src/lib/checkoutFlow";
import { isSplitCart } from "@/src/lib/checkoutGroupFlow";
import { useTranslation } from "@/src/lib/i18n";
import { formatPrice } from "@/src/lib/market";
import type { AddressInput } from "@/src/types/order";

export default function CheckoutDeliveryScreen() {
	const c = useShopTheme();
	const { state } = useCheckoutFlow();
	return (
		<SafeAreaView edges={["top"]} style={{ flex: 1, backgroundColor: c.bg }}>
			<CheckoutHeader current={2} />
			<CheckoutGate needs="address">
				{state.address ? <DeliveryOrSplit address={state.address} /> : null}
			</CheckoutGate>
		</SafeAreaView>
	);
}

// A split cart picks delivery per group inside the review.
function DeliveryOrSplit({ address }: { address: AddressInput }) {
	const cart = useCart();
	if (cart.data && isSplitCart(cart.data)) {
		return <Redirect href="/checkout/review" />;
	}
	return <DeliveryChoice address={address} />;
}

function DeliveryChoice({ address }: { address: AddressInput }) {
	const c = useShopTheme();
	const { t, i18n } = useTranslation();
	const locale = useAppLocale();
	const { protectedPaymentEnabled, buyerProtection } = useAppConfig();
	const { state, dispatch, requestQuote } = useCheckoutFlow();
	const options = useDeliveryOptions(
		address.city,
		address.district,
		state.paymentMethod,
	);
	const [pickedId, setPickedId] = useState(state.option?.optionId ?? null);
	const list = options.data?.options ?? [];
	const picked =
		list.find(
			(o) =>
				o.optionId === pickedId &&
				(state.paymentMethod !== "cod" || o.codAllowed),
		) ?? null;
	const backToAddress = () => router.dismissTo("/checkout/address");

	const choose = () => {
		if (!picked) return;
		dispatch({ type: "optionChosen", option: picked });
		if (landmarkMissingFor(address, picked)) {
			dispatch({ type: "addressRejected", field: "landmark" });
			backToAddress();
			return;
		}
		requestQuote(
			address,
			picked,
			state.paymentMethod,
			(fresh) => dispatch({ type: "quoteLoaded", quote: fresh }),
			backToAddress,
		);
		router.push("/checkout/review");
	};

	return (
		<ScreenColumn width="reading">
			<ScrollView contentContainerStyle={{ padding: 16, gap: 12 }}>
				<Text style={[formStyles.sectionTitle, { color: c.text }]}>
					{t("checkout.deliveryOptions")}
				</Text>
				{protectedPaymentEnabled ? (
					<PaymentMethodPicker
						method={state.paymentMethod}
						fee={null}
						buyerProtection={buyerProtection}
						locale={locale}
						onChoose={(method) =>
							dispatch({ type: "paymentMethodChosen", method })
						}
					/>
				) : null}
				{options.isPending ? (
					<View style={formStyles.row}>
						<ActivityIndicator color={c.primary} />
						<Text style={[formStyles.hint, { color: c.muted }]}>
							{t("checkout.loadingOptions")}
						</Text>
					</View>
				) : null}
				{options.error ? (
					<Text style={formStyles.error} accessibilityRole="alert">
						{resolveErrorMessage(options.error, t)}
					</Text>
				) : null}
				{options.isSuccess && list.length === 0 ? (
					<Text style={[formStyles.hint, { color: c.body }]}>
						{t("checkout.noDeliveryOptions")}
					</Text>
				) : null}
				<View accessibilityRole="radiogroup" style={{ gap: 12 }}>
					{list.map((option) => (
						<DeliveryOptionCard
							key={option.optionId}
							option={option}
							locale={locale}
							checked={option.optionId === pickedId}
							selectable={state.paymentMethod !== "cod" || option.codAllowed}
							onSelect={() => setPickedId(option.optionId)}
						/>
					))}
				</View>
				{options.data?.unavailable.map((option, index) => (
					<Text
						key={`${option.method}-${index}`}
						style={[formStyles.hint, { color: c.warningText }]}
					>
						{t(`checkout.deliveryUnavailable.${option.reason}`, {
							amount: formatPrice(option.minOrderSubtotal ?? 0, i18n.language),
						})}
					</Text>
				))}
				<View style={[formStyles.row, { marginTop: 8 }]}>
					<CheckoutButton
						variant="outline"
						label={t("common.back")}
						onPress={() => router.back()}
					/>
					<CheckoutButton
						label={t("checkout.continue")}
						onPress={choose}
						disabled={!picked}
						style={{ flex: 1 }}
					/>
				</View>
			</ScrollView>
		</ScreenColumn>
	);
}
