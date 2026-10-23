import { Ionicons } from "@expo/vector-icons";
import { router, useLocalSearchParams } from "expo-router";
import * as WebBrowser from "expo-web-browser";
import { type ComponentProps, useEffect, useState } from "react";
import {
	ActivityIndicator,
	Pressable,
	ScrollView,
	StyleSheet,
	Text,
	TextInput,
	View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Fonts } from "@/constants/theme";
import { CheckoutButton } from "@/src/components/checkout/CheckoutButton";
import { useAppLocale } from "@/src/components/checkout/CheckoutProvider";
import { OperatorMark } from "@/src/components/checkout/OperatorMark";
import { EmptyState } from "@/src/components/EmptyState";
import { ScreenColumn } from "@/src/components/layout/ScreenColumn";
import { Sheet } from "@/src/components/purchases/ui";
import { formStyles } from "@/src/components/seller/formStyles";
import { SellerHeader } from "@/src/components/shop/SellerHeader";
import { useShopTheme } from "@/src/components/shop/theme";
import { useCreatePaymentIntent } from "@/src/hooks/useCheckout";
import { usePurchase } from "@/src/hooks/usePurchases";
import { ApiError } from "@/src/lib/api";
import { ERROR_CODES, resolveErrorMessage } from "@/src/lib/apiError";
import { newIdempotencyKey } from "@/src/lib/checkoutFlow";
import { phoneFromTyping } from "@/src/lib/checkoutForm";
import { useTranslation } from "@/src/lib/i18n";
import { formatPrice, isMarketPhone, phoneExample } from "@/src/lib/market";
import {
	pendingReturnDeepLink,
	withAppReturnSignal,
} from "@/src/lib/paymentFlow";
import type { PaymentChannel } from "@/src/lib/paymentStatus";
import { PAYMENT_CHANNEL_LABELS } from "@/src/lib/paymentStatus";
import { operatorFromPhone } from "../../../../api/src/contracts/mobileMoney";

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

	// The delivery number is usually the one that pays: prefilled once, with
	// its operator picked from the prefix. Both stay editable.
	const deliveryPhone = data?.delivery?.phone;
	const deliveryMasked = data?.delivery?.phoneMasked;
	useEffect(() => {
		if (!deliveryPhone || deliveryMasked) return;
		setPhone((current) => current || phoneFromTyping(deliveryPhone));
		setChannel((current) => current ?? operatorFromPhone(deliveryPhone));
	}, [deliveryPhone, deliveryMasked]);

	const onPhoneChange = (text: string) => {
		const next = phoneFromTyping(text);
		setPhone(next);
		const operator = operatorFromPhone(next);
		if (operator) setChannel(operator);
	};

	const canPay =
		channel !== null && isMarketPhone(phone) && !createIntent.isPending;

	const submit = async () => {
		if (!channel || !isMarketPhone(phone)) return;
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

	const money = (amount: number) => formatPrice(amount, locale);
	const firstItem = data.items[0]?.title;

	return (
		<SafeAreaView
			edges={["top", "bottom"]}
			style={{ flex: 1, backgroundColor: c.bg }}
		>
			<SellerHeader
				title={t("payments.method_protected")}
				subtitle={[firstItem, data.shop.name].filter(Boolean).join(" · ")}
				onBack={leave}
				right={
					<View style={[styles.badge, { backgroundColor: c.successSoft }]}>
						<Ionicons
							name="shield-checkmark-outline"
							size={13}
							color={c.successText}
						/>
						<Text style={[styles.badgeText, { color: c.successText }]}>
							{t("payments.protectedBadge")}
						</Text>
					</View>
				}
			/>
			<ScreenColumn width="reading">
				<ScrollView contentContainerStyle={styles.scroll}>
					<Text style={[styles.section, { color: c.text }]}>
						{t("payments.pay_operator")}
					</Text>
					<View style={styles.operators}>
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
										styles.operator,
										{
											borderColor: selected ? c.primary : c.border,
											borderWidth: selected ? 2 : 1,
											backgroundColor: selected ? c.primarySoft : c.card,
										},
									]}
								>
									<OperatorMark channel={option} />
									<View style={styles.flex}>
										<Text
											style={[styles.operatorName, { color: c.text }]}
											numberOfLines={2}
										>
											{t(PAYMENT_CHANNEL_LABELS[option])}
										</Text>
										<Text style={[styles.operatorSub, { color: c.muted }]}>
											{t("payments.pay_mobileMoney")}
										</Text>
									</View>
									{selected ? (
										<Ionicons
											name="checkmark-circle"
											size={20}
											color={c.primary}
											style={styles.check}
										/>
									) : null}
								</Pressable>
							);
						})}
					</View>

					<View
						style={[
							styles.phoneBox,
							{ backgroundColor: c.card, borderColor: c.border },
						]}
					>
						<Text style={[styles.phoneLabel, { color: c.muted }]}>
							{t("payments.pay_phone")}
						</Text>
						<View style={styles.phoneRow}>
							<Ionicons name="call-outline" size={18} color={c.muted} />
							<TextInput
								value={phone}
								onChangeText={onPhoneChange}
								keyboardType="phone-pad"
								autoComplete="tel"
								placeholder={phoneExample()}
								placeholderTextColor={c.muted}
								accessibilityLabel={t("payments.pay_phone")}
								accessibilityHint={t("payments.pay_phoneHint")}
								style={[styles.phoneInput, { color: c.text }]}
							/>
						</View>
					</View>

					<View
						style={[
							formStyles.card,
							{ backgroundColor: c.card, borderColor: c.border },
						]}
					>
						<AmountRow
							label={t("payments.summary_goods")}
							value={money(data.amounts.subtotal)}
						/>
						<AmountRow
							label={t("payments.summary_delivery")}
							value={money(data.amounts.deliveryFee)}
						/>
						<AmountRow
							label={t("payments.summary_protectionFee")}
							value={money(data.amounts.buyerProtectionFee)}
						/>
						<View style={[styles.divider, { backgroundColor: c.border }]} />
						<View style={formStyles.row}>
							<Text style={[styles.totalLabel, { color: c.text }]}>
								{t("payments.summary_total")}
							</Text>
							<Text style={[styles.total, { color: c.primary }]}>
								{money(data.amounts.total)}
							</Text>
						</View>
					</View>

					<View
						style={[
							formStyles.card,
							{ backgroundColor: c.card, borderColor: c.border },
						]}
					>
						<Text style={[styles.cardTitle, { color: c.text }]}>
							{t("payments.money_title")}
						</Text>
						<MoneyStep
							icon="lock-closed-outline"
							title={t("payments.money_heldTitle")}
							body={t("payments.disclosure_holder")}
						/>
						<MoneyStep
							icon="storefront-outline"
							title={t("payments.money_releaseTitle")}
							body={t("payments.sheet_release")}
						/>
						<MoneyStep
							icon="refresh-outline"
							title={t("payments.money_refundTitle")}
							body={t("payments.sheet_cancelRefund")}
						/>
						<Pressable
							onPress={() => setSheetOpen(true)}
							accessibilityRole="button"
							hitSlop={8}
						>
							<Text style={[styles.link, { color: c.primary }]}>
								{t("payments.summary_coverLink")}
							</Text>
						</Pressable>
					</View>

					{formError ? <Text style={formStyles.error}>{formError}</Text> : null}
				</ScrollView>
			</ScreenColumn>
			<View
				style={[styles.bar, { backgroundColor: c.card, borderColor: c.border }]}
			>
				<CheckoutButton
					icon="lock-closed"
					label={t("payments.pay_submit", {
						amount: money(data.amounts.total),
					})}
					onPress={() => void submit()}
					disabled={!canPay}
					loading={createIntent.isPending}
				/>
			</View>

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

function AmountRow({ label, value }: { label: string; value: string }) {
	const c = useShopTheme();
	return (
		<View style={formStyles.row}>
			<Text style={[styles.amountLabel, { color: c.body }]}>{label}</Text>
			<Text style={[styles.amountValue, { color: c.text }]}>{value}</Text>
		</View>
	);
}

function MoneyStep({
	icon,
	title,
	body,
}: {
	icon: ComponentProps<typeof Ionicons>["name"];
	title: string;
	body: string;
}) {
	const c = useShopTheme();
	return (
		<View style={styles.step}>
			<View style={[styles.stepIcon, { backgroundColor: c.primarySoft }]}>
				<Ionicons name={icon} size={16} color={c.primary} />
			</View>
			<View style={styles.flex}>
				<Text style={[styles.stepTitle, { color: c.text }]}>{title}</Text>
				<Text style={[styles.stepBody, { color: c.muted }]}>{body}</Text>
			</View>
		</View>
	);
}

const styles = StyleSheet.create({
	flex: { flex: 1 },
	scroll: { padding: 16, gap: 14, paddingBottom: 24 },
	badge: {
		flexDirection: "row",
		alignItems: "center",
		gap: 4,
		borderRadius: 999,
		paddingHorizontal: 9,
		paddingVertical: 4,
	},
	badgeText: { fontSize: 12, fontFamily: Fonts.bodySemibold },
	section: { fontSize: 15, fontFamily: Fonts.displayBold },
	operators: { flexDirection: "row", gap: 10 },
	operator: {
		flex: 1,
		flexDirection: "row",
		alignItems: "center",
		gap: 10,
		borderRadius: 14,
		padding: 12,
	},
	operatorName: { fontSize: 14, fontFamily: Fonts.displayBold },
	operatorSub: { fontSize: 12, fontFamily: Fonts.body },
	check: { position: "absolute", top: -8, right: -8 },
	phoneBox: {
		borderRadius: 14,
		borderWidth: 1,
		paddingHorizontal: 14,
		paddingVertical: 10,
		gap: 4,
	},
	phoneLabel: { fontSize: 12, fontFamily: Fonts.bodySemibold },
	phoneRow: { flexDirection: "row", alignItems: "center", gap: 10 },
	phoneInput: {
		flex: 1,
		fontSize: 16,
		fontFamily: Fonts.bodySemibold,
		paddingVertical: 4,
	},
	amountLabel: { flex: 1, fontSize: 14, fontFamily: Fonts.body },
	amountValue: { fontSize: 14, fontFamily: Fonts.bodySemibold },
	divider: { height: StyleSheet.hairlineWidth, marginVertical: 2 },
	totalLabel: { flex: 1, fontSize: 16, fontFamily: Fonts.displayBold },
	total: { fontSize: 20, fontFamily: Fonts.displayExtrabold },
	cardTitle: { fontSize: 15, fontFamily: Fonts.displayBold },
	step: { flexDirection: "row", gap: 10, alignItems: "flex-start" },
	stepIcon: {
		width: 30,
		height: 30,
		borderRadius: 9,
		alignItems: "center",
		justifyContent: "center",
	},
	stepTitle: { fontSize: 14, fontFamily: Fonts.bodySemibold },
	stepBody: { fontSize: 12, fontFamily: Fonts.body, lineHeight: 17 },
	link: { fontSize: 13, fontFamily: Fonts.bodySemibold },
	bar: { padding: 16, borderTopWidth: StyleSheet.hairlineWidth },
});
