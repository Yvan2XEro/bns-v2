import { Ionicons } from "@expo/vector-icons";
import { Redirect, router } from "expo-router";
import { useState } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import {
	SafeAreaView,
	useSafeAreaInsets,
} from "react-native-safe-area-context";
import { Fonts } from "@/constants/theme";
import { CheckoutButton } from "@/src/components/checkout/CheckoutButton";
import { CheckoutGate } from "@/src/components/checkout/CheckoutGate";
import { CheckoutHeader } from "@/src/components/checkout/CheckoutHeader";
import {
	useAppLocale,
	useCheckoutFlow,
} from "@/src/components/checkout/CheckoutProvider";
import { DeliveryOptionCard } from "@/src/components/checkout/DeliveryOptionCard";
import { FormError } from "@/src/components/checkout/FormError";
import { PaymentMethodPicker } from "@/src/components/checkout/PaymentMethodPicker";
import { ScreenColumn } from "@/src/components/layout/ScreenColumn";
import { SkeletonBlock } from "@/src/components/SkeletonCard";
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
			<CheckoutHeader current="delivery" />
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
	const insets = useSafeAreaInsets();
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

	const unavailable = options.data?.unavailable ?? [];

	return (
		<View style={styles.flex}>
			<ScreenColumn width="reading">
				<ScrollView contentContainerStyle={styles.scroll}>
					<Text
						style={[styles.title, { color: c.text }]}
						accessibilityRole="header"
					>
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
					{options.isPending ? <OptionsSkeleton /> : null}
					{options.error ? (
						<View style={styles.stack}>
							<FormError message={resolveErrorMessage(options.error, t)} />
							<CheckoutButton
								variant="outline"
								icon="refresh"
								label={t("common.retry")}
								onPress={() => void options.refetch()}
							/>
						</View>
					) : null}
					{options.isSuccess && list.length === 0 ? (
						<View
							style={[
								styles.empty,
								{ backgroundColor: c.card, borderColor: c.border },
							]}
						>
							<View style={styles.emptyRow}>
								<Ionicons name="bicycle-outline" size={22} color={c.muted} />
								<Text style={[styles.body, styles.flex, { color: c.body }]}>
									{t("checkout.noDeliveryOptions")}
								</Text>
							</View>
							{/* The way out of a dead end is another address. */}
							<CheckoutButton
								variant="outline"
								icon="location-outline"
								label={t("checkout.editAddress")}
								onPress={backToAddress}
							/>
						</View>
					) : null}
					<View accessibilityRole="radiogroup" style={styles.stack}>
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
					{unavailable.length > 0 ? (
						<View style={[styles.notice, { backgroundColor: c.warningSoft }]}>
							<Ionicons
								name="information-circle"
								size={18}
								color={c.warningText}
								style={styles.noticeIcon}
							/>
							<View style={[styles.flex, styles.noticeLines]}>
								{unavailable.map((option, index) => (
									<Text
										key={`${option.method}-${index}`}
										style={[styles.note, { color: c.warningText }]}
									>
										{t(`checkout.deliveryUnavailable.${option.reason}`, {
											amount: formatPrice(
												option.minOrderSubtotal ?? 0,
												i18n.language,
											),
										})}
									</Text>
								))}
							</View>
						</View>
					) : null}
				</ScrollView>
			</ScreenColumn>
			{/* The step's actions stay in reach, whatever the length of the list. */}
			<View
				style={[
					styles.bar,
					{
						backgroundColor: c.card,
						borderColor: c.border,
						paddingBottom: 16 + insets.bottom,
					},
				]}
			>
				<ScreenColumn width="reading" style={styles.barColumn}>
					<View style={styles.barRow}>
						<CheckoutButton
							variant="outline"
							label={t("common.back")}
							onPress={() => router.back()}
						/>
						<CheckoutButton
							label={t("checkout.continue")}
							onPress={choose}
							disabled={!picked}
							style={styles.flex}
						/>
					</View>
				</ScreenColumn>
			</View>
		</View>
	);
}

/** Two option cards in the shape of what is coming, instead of a spinner. */
function OptionsSkeleton() {
	const c = useShopTheme();
	const { t } = useTranslation();
	return (
		<View
			style={styles.stack}
			accessible
			accessibilityRole="progressbar"
			accessibilityLabel={t("checkout.loadingOptions")}
		>
			{[0, 1].map((index) => (
				<View
					key={index}
					style={[
						styles.skeletonCard,
						{ backgroundColor: c.card, borderColor: c.border },
					]}
				>
					<SkeletonBlock width={40} height={40} borderRadius={12} />
					<View style={[styles.flex, styles.skeletonLines]}>
						<SkeletonBlock width="60%" height={15} />
						<SkeletonBlock width="40%" height={12} />
					</View>
					<SkeletonBlock width={64} height={18} />
				</View>
			))}
		</View>
	);
}

const styles = StyleSheet.create({
	flex: { flex: 1 },
	scroll: { padding: 16, gap: 12, paddingBottom: 24 },
	stack: { gap: 12 },
	title: { fontSize: 20, lineHeight: 25, fontFamily: Fonts.displayBold },
	body: { fontSize: 15, lineHeight: 21, fontFamily: Fonts.body },
	note: { fontSize: 13, lineHeight: 19, fontFamily: Fonts.bodyMedium },
	empty: {
		gap: 14,
		padding: 16,
		borderRadius: 16,
		borderWidth: StyleSheet.hairlineWidth,
	},
	emptyRow: { flexDirection: "row", alignItems: "center", gap: 12 },
	notice: {
		flexDirection: "row",
		gap: 8,
		padding: 12,
		borderRadius: 12,
	},
	noticeIcon: { marginTop: 1 },
	noticeLines: { gap: 4 },
	bar: {
		paddingTop: 12,
		paddingHorizontal: 16,
		borderTopWidth: StyleSheet.hairlineWidth,
	},
	barColumn: { flex: 0 },
	barRow: { flexDirection: "row", gap: 10 },
	skeletonCard: {
		flexDirection: "row",
		alignItems: "center",
		gap: 12,
		padding: 14,
		borderRadius: 16,
		borderWidth: StyleSheet.hairlineWidth,
	},
	skeletonLines: { gap: 8 },
});
