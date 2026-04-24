import { Ionicons } from "@expo/vector-icons";
import { PlatformPay, usePlatformPay } from "@stripe/stripe-react-native";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { router, useLocalSearchParams } from "expo-router";
import * as WebBrowser from "expo-web-browser";
import { useEffect, useState } from "react";
import {
	ActivityIndicator,
	Platform,
	Pressable,
	StyleSheet,
	Text,
	View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Fonts } from "@/constants/theme";
import { useColorScheme } from "@/hooks/use-color-scheme";
import { AnimatedPressable } from "@/src/components/AnimatedPressable";
import { useAlert } from "@/src/contexts/AlertContext";
import { useAppConfig } from "@/src/contexts/AppConfigContext";
import { api } from "@/src/lib/api";
import { useTranslation } from "@/src/lib/i18n";

const DEEP_LINK_RETURN = "buynsellem://boost/callback";

interface BoostPaymentResponse {
	paymentId: string;
	provider: "notchpay" | "stripe";
	checkoutUrl?: string;
	clientSecret?: string;
}

export default function BoostModal() {
	const { listingId } = useLocalSearchParams<{ listingId: string }>();
	const isDark = useColorScheme() === "dark";
	const { showError, showSuccess } = useAlert();
	const { t } = useTranslation();
	const queryClient = useQueryClient();
	const { stripePublishableKey } = useAppConfig();
	const [selected, setSelected] = useState(1);
	const [isProcessing, setIsProcessing] = useState(false);
	const [applePayAvailable, setApplePayAvailable] = useState(false);

	const { isPlatformPaySupported, confirmPlatformPayPayment } =
		usePlatformPay();

	// Detect Apple Pay availability once on mount (iOS + Stripe configured)
	useEffect(() => {
		if (Platform.OS !== "ios" || !stripePublishableKey) return;
		isPlatformPaySupported().then(setApplePayAvailable);
	}, [isPlatformPaySupported, stripePublishableKey]);

	const canUseApplePay = applePayAvailable;

	const PLANS = [
		{ duration: "7" as const, price: 500, label: t("boost.week1") },
		{
			duration: "14" as const,
			price: 900,
			label: t("boost.week2"),
			popular: true,
		},
		{ duration: "30" as const, price: 1500, label: t("boost.month1") },
	];

	const bg = isDark ? "#0b1120" : "#f8fafc";
	const cardBg = isDark ? "#1e293b" : "#ffffff";
	const textColor = isDark ? "#e2e8f0" : "#0f172a";
	const mutedColor = isDark ? "#94a3b8" : "#64748b";
	const primaryColor = isDark ? "#3b82f6" : "#1e40af";
	const borderColor = isDark ? "#1e3a5f" : "#e2e8f0";

	const selectedPlan = PLANS[selected]!;

	// ── Apple Pay (Stripe) flow — iOS only ────────────────────────────────────

	const handleApplePay = async () => {
		if (!listingId) return;
		setIsProcessing(true);
		try {
			const data = await api.post<BoostPaymentResponse>("/api/public/boost", {
				listingId,
				duration: selectedPlan.duration,
				provider: "stripe",
			});

			if (!data.clientSecret) throw new Error(t("boost.noClientSecret"));

			const { error } = await confirmPlatformPayPayment(data.clientSecret, {
				applePay: {
					cartItems: [
						{
							paymentType: PlatformPay.PaymentType.Immediate,
							label: t("boost.applePayLabel"),
							amount: String(selectedPlan.price),
						},
					],
					merchantCountryCode: "CM",
					currencyCode: "XAF",
				},
			});

			if (error) {
				// User cancelled the sheet — don't show an error toast
				if (error.code !== "Canceled") {
					showError(t("boost.errorTitle"), error.message);
				}
				return;
			}

			// Payment succeeded — webhook will activate the boost asynchronously
			await queryClient.invalidateQueries({ queryKey: ["listing", listingId] });
			showSuccess(t("boost.successTitle"), t("boost.successMessage"));
			router.dismiss();
		} catch (err: unknown) {
			const msg = err instanceof Error ? err.message : t("common.error");
			showError(t("boost.errorTitle"), msg);
		} finally {
			setIsProcessing(false);
		}
	};

	// ── NotchPay browser flow — Android + iOS fallback ────────────────────────

	const { mutate: boostWithNotchPay, isPending: isNotchPending } = useMutation({
		mutationFn: async () => {
			const data = await api.post<BoostPaymentResponse>("/api/public/boost", {
				listingId,
				duration: selectedPlan.duration,
				provider: "notchpay",
				returnUrl: DEEP_LINK_RETURN,
			});

			if (!data.checkoutUrl) throw new Error(t("boost.noCheckoutUrl"));

			// openAuthSessionAsync closes automatically when the browser navigates
			// to a URL matching the scheme — our /boost/callback page triggers this.
			const result = await WebBrowser.openAuthSessionAsync(
				data.checkoutUrl,
				DEEP_LINK_RETURN,
				{ showTitle: false, enableDefaultShareMenuItem: false },
			);

			if (result.type === "success") {
				// Deep link was intercepted — parse status from callback URL
				const qs = result.url.split("?")[1] ?? "";
				const searchParams = new URLSearchParams(qs);
				const status = searchParams.get("status");
				const lid = searchParams.get("listingId") ?? listingId;

				if (status === "success") {
					await queryClient.invalidateQueries({ queryKey: ["listing", lid] });
					showSuccess(t("boost.successTitle"), t("boost.successMessage"));
					router.dismiss();
				} else if (status === "failed") {
					showError(t("boost.errorTitle"), t("boost.paymentFailed"));
				}
				// pending: no action, payment is still processing
			} else {
				// Browser closed without deep link interception (user closed manually
				// or deep link wasn't caught). Query the real payment status.
				try {
					const payment = await api.get<{ status: string }>(
						`/api/boost-payments/${data.paymentId}`,
					);
					if (payment.status === "completed") {
						await queryClient.invalidateQueries({
							queryKey: ["listing", listingId],
						});
						showSuccess(t("boost.successTitle"), t("boost.successMessage"));
						router.dismiss();
					}
					// failed or pending → user cancelled or payment didn't complete; stay on screen
				} catch {
					// ignore — user cancelled and we have no status
				}
			}
		},
		onError: (err: Error) =>
			showError(t("boost.errorTitle"), err.message ?? t("common.error")),
	});

	const isPending = isProcessing || isNotchPending;

	const handlePay = () => {
		if (canUseApplePay) {
			void handleApplePay();
		} else {
			boostWithNotchPay();
		}
	};

	return (
		<SafeAreaView
			edges={["top"]}
			style={[styles.safe, { backgroundColor: bg }]}
		>
			<View style={styles.container}>
				{/* Header */}
				<View style={styles.header}>
					<View style={styles.rocketIconWrap}>
						<Ionicons name="rocket-outline" size={44} color="#f59e0b" />
					</View>
					<Text style={[styles.title, { color: textColor }]}>
						{t("boost.boostTitle")}
					</Text>
					<Text style={[styles.subtitle, { color: mutedColor }]}>
						{t("boost.boostSubtitle")}
					</Text>
				</View>

				{/* Plans */}
				<View style={styles.plans}>
					{PLANS.map((plan, i) => (
						<Pressable
							key={plan.duration}
							onPress={() => setSelected(i)}
							style={[
								styles.planCard,
								{
									backgroundColor:
										selected === i ? (isDark ? "#1e3a5f" : "#dbeafe") : cardBg,
									borderColor: selected === i ? primaryColor : borderColor,
									borderWidth: selected === i ? 2 : 1,
								},
							]}
						>
							{plan.popular && (
								<View style={styles.popularBadge}>
									<Text style={styles.popularText}>
										{t("boost.popularBadge")}
									</Text>
								</View>
							)}
							<View style={styles.planRadio}>
								<View
									style={[
										styles.radio,
										{
											borderColor: selected === i ? primaryColor : mutedColor,
										},
									]}
								>
									{selected === i && (
										<View
											style={[
												styles.radioDot,
												{ backgroundColor: primaryColor },
											]}
										/>
									)}
								</View>
								<View style={styles.planInfo}>
									<Text style={[styles.planLabel, { color: textColor }]}>
										{plan.label}
									</Text>
									<Text style={[styles.planPrice, { color: primaryColor }]}>
										{plan.price.toLocaleString()} XAF
									</Text>
								</View>
							</View>
						</Pressable>
					))}
				</View>

				{/* Pay Button */}
				<AnimatedPressable
					onPress={handlePay}
					disabled={isPending}
					scaleTo={0.97}
					style={styles.payBtn}
				>
					{isPending ? (
						<ActivityIndicator color="#0f172a" />
					) : canUseApplePay ? (
						<>
							<Ionicons name="logo-apple" size={20} color="#0f172a" />
							<Text style={styles.payBtnText}>{t("boost.applePayBtn")}</Text>
						</>
					) : (
						<>
							<Ionicons name="flash" size={18} color="#0f172a" />
							<Text style={styles.payBtnText}>
								{t("boost.payBtn", {
									amount: selectedPlan.price.toLocaleString(),
								})}
							</Text>
						</>
					)}
				</AnimatedPressable>

				{/* Cancel */}
				<Pressable onPress={() => router.dismiss()} style={styles.cancelBtn}>
					<Text style={[styles.cancelText, { color: mutedColor }]}>
						{t("boost.cancelBtn")}
					</Text>
				</Pressable>
			</View>
		</SafeAreaView>
	);
}

const styles = StyleSheet.create({
	safe: { flex: 1 },
	container: { flex: 1, padding: 24, justifyContent: "center" },
	header: { alignItems: "center", marginBottom: 32 },
	rocketIconWrap: {
		width: 80,
		height: 80,
		borderRadius: 40,
		backgroundColor: "rgba(245,158,11,0.12)",
		alignItems: "center",
		justifyContent: "center",
		marginBottom: 16,
	},
	title: {
		fontSize: 24,
		fontFamily: Fonts.displayExtrabold,
		textAlign: "center",
		marginBottom: 8,
	},
	subtitle: {
		fontSize: 14,
		fontFamily: Fonts.body,
		textAlign: "center",
		lineHeight: 20,
	},
	plans: { gap: 12, marginBottom: 24 },
	planCard: {
		borderRadius: 14,
		padding: 16,
		position: "relative",
		overflow: "hidden",
	},
	popularBadge: {
		position: "absolute",
		top: 0,
		right: 0,
		backgroundColor: "#f59e0b",
		borderBottomLeftRadius: 10,
		paddingHorizontal: 10,
		paddingVertical: 4,
	},
	popularText: { color: "#fff", fontSize: 11, fontFamily: Fonts.bodySemibold },
	planRadio: { flexDirection: "row", alignItems: "center", gap: 12 },
	radio: {
		width: 22,
		height: 22,
		borderRadius: 11,
		borderWidth: 2,
		alignItems: "center",
		justifyContent: "center",
	},
	radioDot: { width: 12, height: 12, borderRadius: 6 },
	planInfo: {},
	planLabel: { fontSize: 15, fontFamily: Fonts.bodySemibold },
	planPrice: { fontSize: 18, fontFamily: Fonts.displayExtrabold },
	payBtn: {
		flexDirection: "row",
		alignItems: "center",
		justifyContent: "center",
		gap: 8,
		borderRadius: 14,
		paddingVertical: 16,
		marginBottom: 12,
		backgroundColor: "#f59e0b",
	},
	payBtnText: {
		color: "#0f172a",
		fontSize: 17,
		fontFamily: Fonts.displayExtrabold,
	},
	cancelBtn: { alignItems: "center", padding: 12 },
	cancelText: { fontSize: 14 },
});
