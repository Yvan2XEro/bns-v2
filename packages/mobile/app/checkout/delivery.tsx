import { router } from "expo-router";
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
import { formStyles } from "@/src/components/seller/formStyles";
import { useShopTheme } from "@/src/components/shop/theme";
import { useDeliveryOptions } from "@/src/hooks/useCheckout";
import { resolveErrorMessage } from "@/src/lib/apiError";
import { landmarkMissingFor } from "@/src/lib/checkoutFlow";
import { useTranslation } from "@/src/lib/i18n";
import type { AddressInput } from "@/src/types/order";

export default function CheckoutDeliveryScreen() {
	const c = useShopTheme();
	const { state } = useCheckoutFlow();
	return (
		<SafeAreaView edges={["top"]} style={{ flex: 1, backgroundColor: c.bg }}>
			<CheckoutHeader current={2} />
			<CheckoutGate needs="address">
				{state.address ? <DeliveryChoice address={state.address} /> : null}
			</CheckoutGate>
		</SafeAreaView>
	);
}

function DeliveryChoice({ address }: { address: AddressInput }) {
	const c = useShopTheme();
	const { t } = useTranslation();
	const locale = useAppLocale();
	const { state, dispatch, requestQuote } = useCheckoutFlow();
	const options = useDeliveryOptions(address.city, address.district);
	const [pickedId, setPickedId] = useState(state.option?.optionId ?? null);
	const list = options.data?.options ?? [];
	const picked =
		list.find((o) => o.optionId === pickedId && o.codAllowed) ?? null;
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
			(fresh) => dispatch({ type: "quoteLoaded", quote: fresh }),
			backToAddress,
		);
		router.push("/checkout/review");
	};

	return (
		<ScrollView contentContainerStyle={{ padding: 16, gap: 12 }}>
			<Text style={[formStyles.sectionTitle, { color: c.text }]}>
				{t("checkout.deliveryOptions")}
			</Text>
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
						onSelect={() => setPickedId(option.optionId)}
					/>
				))}
			</View>
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
	);
}
