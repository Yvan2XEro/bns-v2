import { router, useLocalSearchParams } from "expo-router";
import * as WebBrowser from "expo-web-browser";
import { useState } from "react";
import {
	ActivityIndicator,
	Pressable,
	ScrollView,
	Text,
	TextInput,
	View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { CheckoutButton } from "@/src/components/checkout/CheckoutButton";
import { useAppLocale } from "@/src/components/checkout/CheckoutProvider";
import { EmptyState } from "@/src/components/EmptyState";
import { Sheet } from "@/src/components/purchases/ui";
import { formStyles } from "@/src/components/seller/formStyles";
import { SellerHeader } from "@/src/components/shop/SellerHeader";
import { useShopTheme } from "@/src/components/shop/theme";
import { useCreatePaymentIntent } from "@/src/hooks/useCheckout";
import { usePurchase } from "@/src/hooks/usePurchases";
import { ApiError } from "@/src/lib/api";
import { ERROR_CODES, resolveErrorMessage } from "@/src/lib/apiError";
import { newIdempotencyKey } from "@/src/lib/checkoutFlow";
import {
	CHECKOUT_PHONE_PATTERN,
	phoneFromTyping,
} from "@/src/lib/checkoutForm";
import { useTranslation } from "@/src/lib/i18n";
import { formatXaf } from "@/src/lib/orderMoney";
import {
	pendingReturnDeepLink,
	withAppReturnSignal,
} from "@/src/lib/paymentFlow";
import type { PaymentChannel } from "@/src/lib/paymentStatus";
import { PAYMENT_CHANNEL_LABELS } from "@/src/lib/paymentStatus";

const CHANNELS: readonly PaymentChannel[] = ["cm.mtn", "cm.orange"];

/**
 * The channel-and-phone form for a `mobile_money` order still `unpaid`.
 * Every other order state (already paid, an attempt already open, not a
 * protected-payment order at all) redirects or shows `pay_unavailable`
 * instead of this form — the pending screen is the only place a payment's
 * own progress is ever rendered.
 */
export default function CheckoutPayScreen() {
	const { orderId } = useLocalSearchParams<{ orderId: string }>();
	const c = useShopTheme();
	const { t } = useTranslation();
	const locale = useAppLocale();
	const order = usePurchase(orderId);
	const createIntent = useCreatePaymentIntent(orderId);

	const [channel, setChannel] = useState<PaymentChannel | null>(null);
	const [phone, setPhone] = useState("");
	const [sheetOpen, setSheetOpen] = useState(false);
	const [formError, setFormError] = useState<string | null>(null);

	const leave = () =>
		router.canGoBack() ? router.back() : router.replace("/(tabs)/account");

	const data = order.data;
	const canPay =
		channel !== null &&
		CHECKOUT_PHONE_PATTERN.test(phone) &&
		!createIntent.isPending;

	const submit = async () => {
		if (!channel || !CHECKOUT_PHONE_PATTERN.test(phone)) return;
		setFormError(null);
		try {
			const result = await createIntent.mutateAsync({
				channel,
				phone,
				idempotencyKey: newIdempotencyKey(),
			});
			// No channel in the launch market returns a hosted checkout URL
			// today; this stays correct for the day one does, via the same
			// `appReturnUrl` idiom P0's boost flow opens its own checkout with.
			if (result.checkoutUrl) {
				await WebBrowser.openAuthSessionAsync(
					withAppReturnSignal(result.checkoutUrl, orderId),
					pendingReturnDeepLink(orderId),
				);
			}
			router.replace({
				pathname: "/checkout/[orderId]/pending",
				params: {
					orderId,
					channel,
					phone,
					instructions: result.instructions ?? "",
				},
			});
		} catch (error) {
			if (
				error instanceof ApiError &&
				error.code === ERROR_CODES.paymentAttemptInProgress
			) {
				router.replace({
					pathname: "/checkout/[orderId]/pending",
					params: { orderId },
				});
				return;
			}
			setFormError(resolveErrorMessage(error, t));
		}
	};

	if (order.isPending) {
		return (
			<SafeAreaView edges={["top"]} style={{ flex: 1, backgroundColor: c.bg }}>
				<SellerHeader title={t("payments.pay_title")} onBack={leave} />
				<ActivityIndicator style={{ marginTop: 40 }} color={c.primary} />
			</SafeAreaView>
		);
	}

	if (!data) {
		return (
			<SafeAreaView edges={["top"]} style={{ flex: 1, backgroundColor: c.bg }}>
				<SellerHeader title={t("payments.pay_title")} onBack={leave} />
				<EmptyState
					illustration="notFound"
					title={resolveErrorMessage(order.error, t)}
					ctaLabel={t("common.retry")}
					onCta={() => void order.refetch()}
				/>
			</SafeAreaView>
		);
	}

	if (data.paymentStatus === "paid") {
		router.replace({ pathname: "/purchases/[id]", params: { id: data.id } });
		return null;
	}

	if (
		data.paymentMethod === "mobile_money" &&
		(data.paymentStatus === "awaiting_payment" ||
			data.paymentStatus === "failed")
	) {
		router.replace({
			pathname: "/checkout/[orderId]/pending",
			params: { orderId: data.id },
		});
		return null;
	}

	if (
		data.paymentMethod !== "mobile_money" ||
		data.paymentStatus !== "unpaid"
	) {
		return (
			<SafeAreaView edges={["top"]} style={{ flex: 1, backgroundColor: c.bg }}>
				<SellerHeader title={t("payments.pay_title")} onBack={leave} />
				<View style={{ padding: 16 }}>
					<Text style={[formStyles.label, { color: c.text }]}>
						{t("payments.pay_unavailable")}
					</Text>
				</View>
			</SafeAreaView>
		);
	}

	return (
		<SafeAreaView edges={["top"]} style={{ flex: 1, backgroundColor: c.bg }}>
			<SellerHeader title={t("payments.pay_title")} onBack={leave} />
			<ScrollView contentContainerStyle={{ padding: 16, gap: 16 }}>
				<View
					style={[
						formStyles.card,
						{ backgroundColor: c.card, borderColor: c.border },
					]}
				>
					<Text style={[formStyles.label, { color: c.body }]}>
						{t("payments.pay_operator")}
					</Text>
					<View style={formStyles.chips}>
						{CHANNELS.map((option) => {
							const selected = channel === option;
							return (
								<Pressable
									key={option}
									onPress={() => setChannel(option)}
									accessibilityRole="radio"
									accessibilityState={{ checked: selected }}
									accessibilityLabel={t(PAYMENT_CHANNEL_LABELS[option])}
									style={[
										formStyles.chip,
										{
											borderColor: selected ? c.primary : c.border,
											backgroundColor: selected ? c.primarySoft : "transparent",
										},
									]}
								>
									<Text
										style={[
											formStyles.chipText,
											{ color: selected ? c.primary : c.text },
										]}
									>
										{t(PAYMENT_CHANNEL_LABELS[option])}
									</Text>
								</Pressable>
							);
						})}
					</View>

					<Text style={[formStyles.label, { color: c.body }]}>
						{t("payments.pay_phone")}
					</Text>
					<TextInput
						value={phone}
						onChangeText={(text) => setPhone(phoneFromTyping(text))}
						keyboardType="phone-pad"
						autoComplete="tel"
						placeholder="+2376XXXXXXXX"
						placeholderTextColor={c.muted}
						accessibilityLabel={t("payments.pay_phone")}
						style={[
							formStyles.input,
							{
								color: c.text,
								backgroundColor: c.input,
								borderColor: c.border,
							},
						]}
					/>
					<Text style={[formStyles.hint, { color: c.muted }]}>
						{t("payments.pay_phoneHint")}
					</Text>
				</View>

				<View
					style={[
						formStyles.card,
						{ backgroundColor: c.card, borderColor: c.border },
					]}
				>
					<View style={formStyles.row}>
						<Text style={[formStyles.label, { color: c.text, flex: 1 }]}>
							{t("payments.summary_protectionFee")}
						</Text>
						<Text style={[formStyles.label, { color: c.text }]}>
							{formatXaf(data.amounts.buyerProtectionFee, locale)}
						</Text>
					</View>
					<View style={formStyles.row}>
						<Text style={[formStyles.label, { color: c.text, flex: 1 }]}>
							{t("payments.summary_total")}
						</Text>
						<Text style={[formStyles.label, { color: c.text }]}>
							{formatXaf(data.amounts.total, locale)}
						</Text>
					</View>
					<Pressable
						onPress={() => setSheetOpen(true)}
						accessibilityRole="button"
					>
						<Text style={[formStyles.hint, { color: c.primary }]}>
							{t("payments.summary_coverLink")}
						</Text>
					</Pressable>
				</View>

				{formError ? <Text style={formStyles.error}>{formError}</Text> : null}

				<CheckoutButton
					label={t("payments.pay_submit", {
						amount: formatXaf(data.amounts.total, locale),
					})}
					onPress={() => void submit()}
					disabled={!canPay}
					loading={createIntent.isPending}
				/>
			</ScrollView>

			<Sheet
				visible={sheetOpen}
				title={t("payments.sheet_title")}
				onClose={() => setSheetOpen(false)}
				closeLabel={t("common.close")}
			>
				<Text style={[formStyles.hint, { color: c.body }]}>
					{t("payments.sheet_release")}
				</Text>
				<Text style={[formStyles.hint, { color: c.body }]}>
					{t("payments.sheet_cancelRefund")}
				</Text>
				<Text style={[formStyles.hint, { color: c.body }]}>
					{t("payments.sheet_feeRefund")}
				</Text>
			</Sheet>
		</SafeAreaView>
	);
}
