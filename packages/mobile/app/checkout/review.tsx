import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import {
	ActivityIndicator,
	Pressable,
	ScrollView,
	StyleSheet,
	Text,
	View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Fonts } from "@/constants/theme";
import { CheckoutButton } from "@/src/components/checkout/CheckoutButton";
import { CheckoutGate } from "@/src/components/checkout/CheckoutGate";
import { CheckoutHeader } from "@/src/components/checkout/CheckoutHeader";
import {
	useAppLocale,
	useCheckoutFlow,
} from "@/src/components/checkout/CheckoutProvider";
import { OrderSummaryCard } from "@/src/components/checkout/OrderSummaryCard";
import { PreContractPanel } from "@/src/components/checkout/PreContractPanel";
import { formStyles } from "@/src/components/seller/formStyles";
import { useShopTheme } from "@/src/components/shop/theme";
import { ApiError } from "@/src/lib/api";
import { ERROR_CODES, resolveErrorMessage } from "@/src/lib/apiError";
import {
	canPlaceOrder,
	newIdempotencyKey,
	placeOrderBody,
	quoteDifferences,
} from "@/src/lib/checkoutFlow";
import { useTranslation } from "@/src/lib/i18n";

export default function CheckoutReviewScreen() {
	const c = useShopTheme();
	return (
		<SafeAreaView edges={["top"]} style={{ flex: 1, backgroundColor: c.bg }}>
			<CheckoutHeader current={3} />
			<CheckoutGate needs="option">
				<Review />
			</CheckoutGate>
		</SafeAreaView>
	);
}

const isQuoteChanged = (error: unknown) =>
	error instanceof ApiError && error.code === ERROR_CODES.checkoutQuoteChanged;

function Review() {
	const c = useShopTheme();
	const { t } = useTranslation();
	const locale = useAppLocale();
	const { state, dispatch, quote, place, requestQuote } = useCheckoutFlow();
	const backToAddress = () => router.dismissTo("/checkout/address");

	const retryQuote = () => {
		if (!state.address || !state.option) return;
		requestQuote(
			state.address,
			state.option,
			(fresh) => dispatch({ type: "quoteLoaded", quote: fresh }),
			backToAddress,
		);
	};

	// `checkout.quoteChanged` is answered with a new quote, never a retry: the
	// buyer must see, and tick for, the summary that will actually be placed.
	const placeOrder = () => {
		const body = placeOrderBody(state, locale);
		if (!body) return;
		place.mutate(body, {
			onSuccess: (placed) => {
				router.dismissAll();
				router.replace({
					pathname: "/checkout/confirmation/[id]",
					params: { id: placed.orderId, c: placed.confirmationRequired },
				});
			},
			onError: (error) => {
				if (!isQuoteChanged(error) || !state.address || !state.option) return;
				requestQuote(
					state.address,
					state.option,
					(fresh) =>
						dispatch({
							type: "quoteChanged",
							quote: fresh,
							idempotencyKey: newIdempotencyKey(),
						}),
					backToAddress,
				);
			},
		});
	};

	if (quote.isPending) {
		return (
			<View style={[formStyles.row, { padding: 16 }]}>
				<ActivityIndicator color={c.primary} />
				<Text style={[formStyles.hint, { color: c.muted }]}>
					{t("checkout.loadingQuote")}
				</Text>
			</View>
		);
	}
	if (!state.quote) {
		return (
			<View style={{ padding: 16, gap: 12 }}>
				{quote.error ? (
					<Text style={formStyles.error} accessibilityRole="alert">
						{resolveErrorMessage(quote.error, t)}
					</Text>
				) : null}
				<View style={formStyles.row}>
					<CheckoutButton
						variant="outline"
						label={t("common.back")}
						onPress={() => router.back()}
					/>
					<CheckoutButton
						label={t("checkout.retryQuote")}
						onPress={retryQuote}
						style={{ flex: 1 }}
					/>
				</View>
			</View>
		);
	}

	const placeError =
		place.error && !isQuoteChanged(place.error) ? place.error : null;
	const shown = placeError ?? quote.error;

	return (
		<ScrollView contentContainerStyle={{ padding: 16, gap: 16 }}>
			{state.previousQuote ? (
				<View
					style={[styles.notice, { backgroundColor: c.warningSoft }]}
					accessibilityRole="alert"
				>
					<Ionicons name="alert-circle" size={20} color={c.warningText} />
					<View style={{ flex: 1, gap: 2 }}>
						<Text style={[styles.noticeTitle, { color: c.warningText }]}>
							{t("checkout.quoteChanged")}
						</Text>
						<Text style={[formStyles.hint, { color: c.warningText }]}>
							{t("checkout.quoteChangedBody")}
						</Text>
					</View>
				</View>
			) : null}
			<OrderSummaryCard
				quote={state.quote}
				changed={quoteDifferences(state.previousQuote, state.quote)}
				locale={locale}
			/>
			<PreContractPanel
				contract={state.quote.preContract}
				language={state.contractLocale ?? locale}
				appLanguage={locale}
				onLanguage={(next) =>
					dispatch({ type: "contractLocale", locale: next })
				}
			/>
			<Pressable
				onPress={() =>
					dispatch({ type: "accepted", accepted: !state.accepted })
				}
				accessibilityRole="checkbox"
				accessibilityLabel={t("checkout.acceptTerms")}
				accessibilityState={{ checked: state.accepted }}
				style={styles.accept}
			>
				<Ionicons
					name={state.accepted ? "checkbox" : "square-outline"}
					size={24}
					color={state.accepted ? c.primary : c.muted}
				/>
				<Text style={[styles.acceptText, { color: c.text }]}>
					{t("checkout.acceptTerms")}
				</Text>
			</Pressable>
			{shown ? (
				<Text style={formStyles.error} accessibilityRole="alert">
					{resolveErrorMessage(shown, t)}
				</Text>
			) : null}
			<CheckoutButton
				label={t("checkout.placeOrder")}
				onPress={placeOrder}
				disabled={!canPlaceOrder(state)}
				loading={place.isPending}
			/>
		</ScrollView>
	);
}

const styles = StyleSheet.create({
	notice: { flexDirection: "row", gap: 10, padding: 12, borderRadius: 14 },
	noticeTitle: { fontSize: 14, fontFamily: Fonts.bodySemibold },
	accept: {
		flexDirection: "row",
		alignItems: "center",
		gap: 10,
		minHeight: 44,
	},
	acceptText: { flex: 1, fontSize: 14, fontFamily: Fonts.body },
});
