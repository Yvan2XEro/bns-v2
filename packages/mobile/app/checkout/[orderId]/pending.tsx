import { Ionicons } from "@expo/vector-icons";
import * as Notifications from "expo-notifications";
import { router, useLocalSearchParams } from "expo-router";
import { useEffect, useRef, useState } from "react";
import {
	ActivityIndicator,
	Linking,
	Pressable,
	ScrollView,
	StyleSheet,
	Text,
	View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Fonts } from "@/constants/theme";
import { CheckoutButton } from "@/src/components/checkout/CheckoutButton";
import { FormError } from "@/src/components/checkout/FormError";
import { inkOf } from "@/src/components/checkout/fill";
import { TotalTag } from "@/src/components/checkout/TotalTag";
import { ScreenColumn } from "@/src/components/layout/ScreenColumn";
import { formStyles } from "@/src/components/seller/formStyles";
import { SellerHeader } from "@/src/components/shop/SellerHeader";
import { useShopTheme } from "@/src/components/shop/theme";
import {
	useCreatePaymentIntent,
	usePaymentStatus,
} from "@/src/hooks/useCheckout";
import { useCancelOrder } from "@/src/hooks/useOrderActions";
import { usePurchase } from "@/src/hooks/usePurchases";
import { ERROR_CODES, resolveErrorMessage } from "@/src/lib/apiError";
import { newIdempotencyKey } from "@/src/lib/checkoutFlow";
import { hapticOutcome } from "@/src/lib/haptics";
import { useTranslation } from "@/src/lib/i18n";
import { formatPrice } from "@/src/lib/market";
import { availableActions } from "@/src/lib/orderActions";
import {
	codFallbackOffered,
	failedActions,
	formatCountdown,
	pendingPhaseOf,
	reminderFireAt,
	resendSecondsLeft,
	secondsUntil,
} from "@/src/lib/paymentFlow";
import type { PaymentChannel } from "@/src/lib/paymentStatus";
import {
	PAYMENT_CHANNEL_INSTRUCTIONS,
	PAYMENT_FAILURE_MESSAGES,
} from "@/src/lib/paymentStatus";
import {
	MOBILE_MONEY_USSD,
	ussdDialUrl,
} from "../../../../api/src/contracts/mobileMoney";

/**
 * The one screen every payment state renders through: checking, pending
 * (with the countdown and per-channel instructions), failed (with attempts
 * left), expired/cancelled, and succeeded. `channel`/`phone`/`instructions`
 * arrive as route params from `pay.tsx`'s own submit and are the only way
 * this screen can resend without asking the buyer to type them again — a
 * fresh deep-link return (no params) still renders every phase correctly,
 * it just cannot offer a one-tap resend.
 */
export default function CheckoutPendingScreen() {
	const params = useLocalSearchParams<{
		orderId: string;
		channel?: PaymentChannel;
		phone?: string;
		instructions?: string;
	}>();
	const { orderId, channel, phone, instructions } = params;
	const c = useShopTheme();
	const { t, i18n } = useTranslation();
	const status = usePaymentStatus(orderId);
	const createIntent = useCreatePaymentIntent(orderId);
	const purchase = usePurchase(orderId);
	const cancel = useCancelOrder(orderId);

	const [now, setNow] = useState(() => new Date());
	useEffect(() => {
		const timer = setInterval(() => setNow(new Date()), 1000);
		return () => clearInterval(timer);
	}, []);

	const intent = status.data?.intent ?? null;

	// Each distinct attempt gets its own resend cooldown window.
	const attemptStartedAtRef = useRef(new Date());
	const lastIntentIdRef = useRef<string | null>(null);
	useEffect(() => {
		if (intent && intent.id !== lastIntentIdRef.current) {
			lastIntentIdRef.current = intent.id;
			attemptStartedAtRef.current = new Date();
		}
	}, [intent]);

	// The "about to expire" local reminder: scheduled while an attempt is
	// open, cancelled (and never re-fires) once it no longer is.
	const notificationIdRef = useRef<string | null>(null);
	const intentStatus = intent?.status ?? null;
	const intentExpiresAt = intent?.expiresAt ?? null;
	useEffect(() => {
		let active = true;
		async function sync() {
			if (notificationIdRef.current) {
				// A previously-cancelled or already-fired id throws; either way
				// there is nothing left to cancel.
				await Notifications.cancelScheduledNotificationAsync(
					notificationIdRef.current,
				).catch(() => undefined);
				notificationIdRef.current = null;
			}
			if (!intentStatus || !intentExpiresAt) return;
			const fireAt = reminderFireAt(intentExpiresAt, intentStatus, new Date());
			if (fireAt === null) return;
			const permission = await Notifications.getPermissionsAsync().catch(
				() => null,
			);
			if (!permission?.granted || !active) return;
			const seconds = Math.max(1, Math.round((fireAt - Date.now()) / 1000));
			const id = await Notifications.scheduleNotificationAsync({
				content: {
					title: t("payments.pending_reminderTitle"),
					body: t("payments.pending_reminderBody"),
				},
				trigger: {
					type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL,
					seconds,
				},
			}).catch(() => null);
			if (active) notificationIdRef.current = id;
		}
		void sync();
		return () => {
			active = false;
		};
	}, [intentStatus, intentExpiresAt, t]);

	useEffect(() => {
		return () => {
			if (notificationIdRef.current) {
				// Unmounting mid-attempt: same "nothing left to cancel" case above.
				void Notifications.cancelScheduledNotificationAsync(
					notificationIdRef.current,
				).catch(() => undefined);
			}
		};
	}, []);

	const goToOrder = () =>
		router.replace({ pathname: "/purchases/[id]", params: { id: orderId } });

	const resend = async () => {
		if (!channel || !phone) return;
		try {
			await createIntent.mutateAsync({
				channel,
				phone,
				idempotencyKey: newIdempotencyKey(),
			});
			attemptStartedAtRef.current = new Date();
			void status.refetch();
		} catch {
			// Surfaced below through `createIntent.error`.
		}
	};

	const changeOperator = () =>
		router.replace({
			pathname: "/checkout/[orderId]/pay",
			params: { orderId },
		});

	// Cancels the order, exactly as web's "Pay on delivery instead" does: the
	// stock this order held is freed by the cancellation itself, and the
	// buyer re-places on their own from the purchases list — no separate
	// COD-conversion transition.
	const payOnDelivery = async () => {
		await cancel.mutateAsync({ reason: "buyer_changed_mind" });
		router.replace("/purchases");
	};

	const phase = status.data ? pendingPhaseOf(status.data, now) : "checking";

	// The money went through: felt once, when the screen sees it happen.
	const announcedRef = useRef(false);
	useEffect(() => {
		if (phase !== "succeeded" || announcedRef.current) return;
		announcedRef.current = true;
		hapticOutcome("success");
	}, [phase]);
	const resendSeconds = resendSecondsLeft(attemptStartedAtRef.current, now);
	const canResendNow = resendSeconds === 0 && Boolean(channel && phone);

	// Inferred the same way web does: a fresh attempt at zero attempts left
	// would be refused with exactly this code, so there is no need to wait
	// for the server to say so again.
	const order = purchase.data;
	const orderAllowsCod = order
		? availableActions(order, "buyer", null).includes("cancel")
		: false;
	const offerCod =
		Boolean(intent) &&
		intent?.attemptsLeft === 0 &&
		codFallbackOffered(ERROR_CODES.paymentTooManyAttempts, orderAllowsCod);
	const failedCardActions = intent
		? failedActions(intent.attemptsLeft, offerCod)
		: [];

	return (
		<SafeAreaView edges={["top"]} style={{ flex: 1, backgroundColor: c.bg }}>
			<SellerHeader title={t("payments.pending_title")} onBack={goToOrder} />
			<ScreenColumn width="reading">
				<ScrollView
					contentContainerStyle={{ padding: 16, gap: 16, paddingBottom: 32 }}
				>
					{phase === "checking" ? (
						<View
							style={styles.checking}
							accessibilityLiveRegion="polite"
							accessibilityLabel={t("payments.pending_checking")}
						>
							<ActivityIndicator color={c.primary} size="large" />
							<Text style={[styles.body, { color: c.body }]}>
								{t("payments.pending_checking")}
							</Text>
						</View>
					) : null}

					{phase === "pending" && intent ? (
						<View
							style={[
								formStyles.card,
								{ backgroundColor: c.card, borderColor: c.border },
							]}
						>
							<View style={styles.lead}>
								<View style={[styles.tile, { backgroundColor: c.primarySoft }]}>
									<Ionicons
										name="phone-portrait-outline"
										size={22}
										color={inkOf(c)}
									/>
								</View>
								<Text
									style={[styles.countdown, { color: c.text }]}
									accessibilityRole="timer"
								>
									{t("payments.pending_expiresIn", {
										time: formatCountdown(secondsUntil(intent.expiresAt, now)),
									})}
								</Text>
							</View>
							{purchase.data ? (
								// The exact amount the operator's prompt will show, to check
								// before typing the PIN.
								<View
									style={styles.amount}
									accessible
									accessibilityLabel={t("payments.pending_amount", {
										amount: formatPrice(
											purchase.data.amounts.total,
											i18n.language,
										),
									})}
								>
									<Text style={[styles.amountLabel, { color: c.body }]}>
										{t("payments.summary_total")}
									</Text>
									<TotalTag
										size="xl"
										amount={formatPrice(
											purchase.data.amounts.total,
											i18n.language,
										)}
									/>
								</View>
							) : null}
							<View style={[styles.divider, { backgroundColor: c.border }]} />
							<Text
								style={[styles.subhead, { color: c.text }]}
								accessibilityRole="header"
							>
								{t("payments.pending_providerInstructions")}
							</Text>
							<Text style={[styles.body, { color: c.body }]}>
								{instructions ||
									t(PAYMENT_CHANNEL_INSTRUCTIONS[intent.channel])}
							</Text>
							<CheckoutButton
								label={t("payments.pending_dialMenu", {
									code: MOBILE_MONEY_USSD[intent.channel],
								})}
								variant="outline"
								icon="keypad-outline"
								onPress={() =>
									void Linking.openURL(ussdDialUrl(intent.channel)).catch(
										() => undefined,
									)
								}
							/>
							{canResendNow ? (
								<Pressable
									onPress={() => void resend()}
									accessibilityRole="button"
									style={styles.linkTarget}
								>
									<Text style={[styles.link, { color: inkOf(c) }]}>
										{t("payments.pending_noPrompt")}
									</Text>
								</Pressable>
							) : channel && phone ? (
								<Text style={[styles.meta, { color: c.muted }]}>
									{t("payments.pending_noPromptWait", {
										time: formatCountdown(resendSeconds),
									})}
								</Text>
							) : null}
						</View>
					) : null}

					{phase === "failed" && intent ? (
						<View
							style={[
								formStyles.card,
								{ backgroundColor: c.card, borderColor: c.border },
							]}
						>
							<View style={styles.lead}>
								<View style={[styles.tile, { backgroundColor: c.dangerSoft }]}>
									<Ionicons
										name="close-circle"
										size={22}
										color={c.dangerText}
									/>
								</View>
								<Text
									style={[styles.title, { color: c.text }]}
									accessibilityRole="header"
								>
									{t("payments.failed_title")}
								</Text>
							</View>
							{intent.failureCode ? (
								<Text style={[styles.body, { color: c.body }]}>
									{t(PAYMENT_FAILURE_MESSAGES[intent.failureCode])}
								</Text>
							) : null}
							<Text style={[styles.meta, { color: c.muted }]}>
								{t("payments.failed_attemptsLeft", {
									attempts: intent.attemptsLeft,
								})}
							</Text>
							{failedCardActions.includes("retry") && channel && phone ? (
								<CheckoutButton
									label={t("payments.failed_retry")}
									onPress={() => void resend()}
									loading={createIntent.isPending}
								/>
							) : null}
							{failedCardActions.includes("changeOperator") ? (
								<Pressable
									onPress={changeOperator}
									accessibilityRole="button"
									style={styles.linkTarget}
								>
									<Text style={[styles.link, { color: inkOf(c) }]}>
										{t("payments.failed_changeNumber")}
									</Text>
								</Pressable>
							) : null}
							{failedCardActions.includes("payOnDelivery") ? (
								<CheckoutButton
									label={t("payments.pay_payOnDelivery")}
									onPress={() => void payOnDelivery()}
									loading={cancel.isPending}
									variant="outline"
								/>
							) : null}
						</View>
					) : null}

					{phase === "expired" || phase === "cancelled" ? (
						<View
							style={[
								formStyles.card,
								{ backgroundColor: c.card, borderColor: c.border },
							]}
						>
							<View style={styles.lead}>
								<View style={[styles.tile, { backgroundColor: c.warningSoft }]}>
									<Ionicons
										name="time-outline"
										size={22}
										color={c.warningText}
									/>
								</View>
								<Text
									style={[styles.title, { color: c.text }]}
									accessibilityRole="header"
								>
									{t("payments.expired_title")}
								</Text>
							</View>
							<Text style={[styles.body, { color: c.body }]}>
								{t("payments.expired_body")}
							</Text>
							<CheckoutButton
								variant="outline"
								label={t("checkout.viewOrder")}
								onPress={goToOrder}
							/>
						</View>
					) : null}

					{phase === "succeeded" ? (
						<View
							style={[
								formStyles.card,
								{ backgroundColor: c.card, borderColor: c.border },
							]}
							accessibilityLiveRegion="polite"
						>
							<View style={styles.lead}>
								<View style={[styles.tile, { backgroundColor: c.successSoft }]}>
									<Ionicons
										name="checkmark-circle"
										size={24}
										color={c.successText}
									/>
								</View>
								<Text style={[styles.body, styles.flex, { color: c.text }]}>
									{t("payments.success_banner")}
								</Text>
							</View>
							<CheckoutButton
								label={t("checkout.viewOrder")}
								onPress={goToOrder}
							/>
						</View>
					) : null}

					<FormError
						message={
							createIntent.error
								? resolveErrorMessage(createIntent.error, t)
								: null
						}
					/>
				</ScrollView>
			</ScreenColumn>
		</SafeAreaView>
	);
}

const styles = StyleSheet.create({
	flex: { flex: 1 },
	checking: { alignItems: "center", gap: 14, paddingTop: 40 },
	lead: { flexDirection: "row", alignItems: "center", gap: 12 },
	tile: {
		width: 44,
		height: 44,
		borderRadius: 12,
		alignItems: "center",
		justifyContent: "center",
	},
	countdown: {
		flex: 1,
		fontSize: 16,
		lineHeight: 21,
		fontFamily: Fonts.bodySemibold,
		fontVariant: ["tabular-nums"],
	},
	title: {
		flex: 1,
		fontSize: 18,
		lineHeight: 23,
		fontFamily: Fonts.displayBold,
	},
	amount: { gap: 6, paddingVertical: 4 },
	amountLabel: { fontSize: 14, fontFamily: Fonts.bodySemibold },
	divider: { height: StyleSheet.hairlineWidth },
	subhead: { fontSize: 15, fontFamily: Fonts.bodySemibold },
	body: { fontSize: 15, lineHeight: 22, fontFamily: Fonts.body },
	meta: { fontSize: 13, lineHeight: 19, fontFamily: Fonts.body },
	linkTarget: { minHeight: 44, justifyContent: "center" },
	link: {
		fontSize: 15,
		fontFamily: Fonts.bodySemibold,
		textDecorationLine: "underline",
	},
});
