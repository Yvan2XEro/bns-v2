import { Ionicons } from "@expo/vector-icons";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { router, useLocalSearchParams } from "expo-router";
import * as WebBrowser from "expo-web-browser";
import { useEffect, useState } from "react";
import {
	ActivityIndicator,
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
import { ApiError, api } from "@/src/lib/api";
import { useAuth } from "@/src/lib/auth";
import { useTranslation } from "@/src/lib/i18n";

const DEEP_LINK_RETURN = "buynsellem://boost/callback";

interface BoostPaymentResponse {
	paymentId: string;
	provider: "notchpay" | "stripe";
	checkoutUrl?: string;
}

type PaymentMethod = "notchpay" | "stripe";

export default function BoostModal() {
	const { listingId } = useLocalSearchParams<{ listingId: string }>();
	const isDark = useColorScheme() === "dark";
	const { showError, showSuccess } = useAlert();
	const { t } = useTranslation();
	const queryClient = useQueryClient();
	const { stripePublishableKey } = useAppConfig();
	const { user } = useAuth();
	const [selected, setSelected] = useState(1);
	const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("notchpay");

	const stripeAvailable = !!stripePublishableKey;

	useEffect(() => {
		if (!user) {
			router.replace("/auth/login");
		}
	}, [user]);

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

	const { mutate: handlePay, isPending } = useMutation({
		mutationFn: async () => {
			const data = await api.post<BoostPaymentResponse>("/api/public/boost", {
				listingId,
				duration: selectedPlan.duration,
				provider: paymentMethod,
				returnUrl: DEEP_LINK_RETURN,
			});

			if (!data.checkoutUrl) throw new Error(t("boost.noCheckoutUrl"));

			const result = await WebBrowser.openAuthSessionAsync(
				data.checkoutUrl,
				DEEP_LINK_RETURN,
				{ showTitle: false, enableDefaultShareMenuItem: false },
			);

			if (result.type === "success") {
				const qs = result.url.split("?")[1] ?? "";
				const params = new URLSearchParams(qs);
				const status = params.get("status");
				const lid = params.get("listingId") ?? listingId ?? "";

				if (status === "success") {
					await queryClient.invalidateQueries({ queryKey: ["listing", lid] });
					showSuccess(t("boost.successTitle"), t("boost.successMessage"));
					router.dismiss();
				} else if (status === "failed" || status === "cancelled") {
					showError(t("boost.errorTitle"), t("boost.paymentFailed"));
				}
			} else {
				// L'utilisateur a fermé le navigateur — vérifier si le paiement est passé
				try {
					const payment = await api.get<{ status: string }>(
						`/api/boost-payments/${data.paymentId}`,
					);
					if (payment.status === "completed") {
						await queryClient.invalidateQueries({
							queryKey: ["listing", listingId ?? ""],
						});
						showSuccess(t("boost.successTitle"), t("boost.successMessage"));
						router.dismiss();
					}
				} catch {
					// annulé, on ignore
				}
			}
		},
		onError: (err: unknown) => {
			if (err instanceof ApiError && err.status === 401) {
				router.replace("/auth/login");
				return;
			}
			showError(
				t("boost.errorTitle"),
				err instanceof Error ? err.message : t("common.error"),
			);
		},
	});

	return (
		<SafeAreaView
			edges={["top"]}
			style={[styles.safe, { backgroundColor: bg }]}
		>
			<Pressable onPress={() => router.dismiss()} style={styles.closeBtn}>
				<Ionicons name="close" size={24} color={textColor} />
			</Pressable>
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
										{ borderColor: selected === i ? primaryColor : mutedColor },
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

				{/* Payment method selector */}
				<Text style={[styles.sectionLabel, { color: mutedColor }]}>
					{t("boost.paymentMethod")}
				</Text>
				<View style={styles.methodRow}>
					{/* Mobile Money */}
					<Pressable
						onPress={() => setPaymentMethod("notchpay")}
						style={[
							styles.methodCard,
							{
								backgroundColor: cardBg,
								borderColor:
									paymentMethod === "notchpay" ? "#f59e0b" : borderColor,
								borderWidth: paymentMethod === "notchpay" ? 2 : 1,
							},
						]}
					>
						<Ionicons
							name="phone-portrait-outline"
							size={22}
							color={paymentMethod === "notchpay" ? "#f59e0b" : mutedColor}
						/>
						<Text
							style={[
								styles.methodLabel,
								{ color: paymentMethod === "notchpay" ? "#f59e0b" : textColor },
							]}
						>
							{t("boost.mobileMoney")}
						</Text>
						<Text style={[styles.methodDesc, { color: mutedColor }]}>
							{t("boost.mobileMoneyDesc")}
						</Text>
					</Pressable>

					{/* Card (Stripe Checkout) */}
					<Pressable
						onPress={() => stripeAvailable && setPaymentMethod("stripe")}
						style={[
							styles.methodCard,
							{
								backgroundColor: cardBg,
								borderColor:
									paymentMethod === "stripe" ? primaryColor : borderColor,
								borderWidth: paymentMethod === "stripe" ? 2 : 1,
								opacity: stripeAvailable ? 1 : 0.4,
							},
						]}
					>
						<Ionicons
							name="card-outline"
							size={22}
							color={paymentMethod === "stripe" ? primaryColor : mutedColor}
						/>
						<Text
							style={[
								styles.methodLabel,
								{
									color: paymentMethod === "stripe" ? primaryColor : textColor,
								},
							]}
						>
							{t("boost.card")}
						</Text>
						<Text style={[styles.methodDesc, { color: mutedColor }]}>
							{stripeAvailable
								? t("boost.cardDesc")
								: t("boost.cardUnavailable")}
						</Text>
					</Pressable>
				</View>

				{/* Pay Button */}
				<AnimatedPressable
					onPress={() => handlePay()}
					disabled={isPending}
					scaleTo={0.97}
					style={[
						styles.payBtn,
						{
							backgroundColor:
								paymentMethod === "stripe" ? primaryColor : "#f59e0b",
						},
					]}
				>
					{isPending ? (
						<ActivityIndicator color="#fff" />
					) : (
						<>
							<Ionicons
								name="flash"
								size={18}
								color={paymentMethod === "stripe" ? "#fff" : "#0f172a"}
							/>
							<Text
								style={[
									styles.payBtnText,
									{ color: paymentMethod === "stripe" ? "#fff" : "#0f172a" },
								]}
							>
								{paymentMethod === "stripe"
									? t("boost.cardPayBtn", {
											amount: selectedPlan.price.toLocaleString(),
										})
									: t("boost.payBtn", {
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
	closeBtn: { padding: 16, alignSelf: "flex-end" },
	container: { flex: 1, padding: 24, justifyContent: "center" },
	header: { alignItems: "center", marginBottom: 24 },
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
	plans: { gap: 10, marginBottom: 20 },
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
	sectionLabel: {
		fontSize: 12,
		fontFamily: Fonts.bodySemibold,
		marginBottom: 8,
		textTransform: "uppercase",
		letterSpacing: 0.5,
	},
	methodRow: { flexDirection: "row", gap: 10, marginBottom: 20 },
	methodCard: {
		flex: 1,
		borderRadius: 14,
		padding: 12,
		alignItems: "center",
		gap: 6,
	},
	methodLabel: {
		fontSize: 13,
		fontFamily: Fonts.bodySemibold,
		textAlign: "center",
	},
	methodDesc: { fontSize: 11, fontFamily: Fonts.body, textAlign: "center" },
	payBtn: {
		flexDirection: "row",
		alignItems: "center",
		justifyContent: "center",
		gap: 8,
		borderRadius: 14,
		paddingVertical: 16,
		marginBottom: 12,
	},
	payBtnText: { fontSize: 17, fontFamily: Fonts.displayExtrabold },
	cancelBtn: { alignItems: "center", padding: 12 },
	cancelText: { fontSize: 14 },
});
