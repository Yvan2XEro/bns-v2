import { Ionicons } from "@expo/vector-icons";
import { useMutation } from "@tanstack/react-query";
import { router, useLocalSearchParams } from "expo-router";
import * as WebBrowser from "expo-web-browser";
import { useState } from "react";
import {
	ActivityIndicator,
	Alert,
	Pressable,
	StyleSheet,
	Text,
	View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useColorScheme } from "@/hooks/use-color-scheme";
import { api } from "@/src/lib/api";

const PLANS = [
	{ duration: 7, price: 500, label: "1 semaine" },
	{ duration: 14, price: 900, label: "2 semaines", popular: true },
	{ duration: 30, price: 1500, label: "1 mois" },
];

export default function BoostModal() {
	const { listingId } = useLocalSearchParams<{ listingId: string }>();
	const isDark = useColorScheme() === "dark";
	const [selected, setSelected] = useState(1);

	const bg = isDark ? "#0b1120" : "#f8fafc";
	const cardBg = isDark ? "#1e293b" : "#ffffff";
	const textColor = isDark ? "#e2e8f0" : "#0f172a";
	const mutedColor = isDark ? "#94a3b8" : "#64748b";
	const primaryColor = isDark ? "#3b82f6" : "#1e40af";
	const borderColor = isDark ? "#1e3a5f" : "#e2e8f0";
	const amberColor = "#f59e0b";

	const { mutate: boost, isPending } = useMutation({
		mutationFn: () =>
			api.post<any>("/api/public/boost", {
				listing: listingId,
				durationDays: PLANS[selected].duration,
			}),
		onSuccess: async (data) => {
			if (data.checkoutUrl) {
				await WebBrowser.openBrowserAsync(data.checkoutUrl);
			}
			router.dismiss();
		},
		onError: (err: any) =>
			Alert.alert("Erreur", err.message ?? "Une erreur est survenue"),
	});

	return (
		<SafeAreaView style={[styles.safe, { backgroundColor: bg }]}>
			<View style={styles.container}>
				{/* Header */}
				<View style={styles.header}>
					<Text style={styles.rocketEmoji}>🚀</Text>
					<Text style={[styles.title, { color: textColor }]}>
						Boostez votre annonce
					</Text>
					<Text style={[styles.subtitle, { color: mutedColor }]}>
						Mettez votre annonce en avant et obtenez plus de visibilité
					</Text>
				</View>

				{/* Plans */}
				<View style={styles.plans}>
					{PLANS.map((plan, i) => (
						<Pressable
							key={i}
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
								<View
									style={[styles.popularBadge, { backgroundColor: amberColor }]}
								>
									<Text style={styles.popularText}>Populaire</Text>
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

				{/* Pay Button */}
				<Pressable
					onPress={() => boost()}
					disabled={isPending}
					style={[styles.payBtn, { backgroundColor: amberColor }]}
				>
					{isPending ? (
						<ActivityIndicator color="#fff" />
					) : (
						<>
							<Ionicons name="flash" size={18} color="#fff" />
							<Text style={styles.payBtnText}>
								Payer {PLANS[selected].price.toLocaleString()} XAF
							</Text>
						</>
					)}
				</Pressable>

				{/* Cancel */}
				<Pressable onPress={() => router.dismiss()} style={styles.cancelBtn}>
					<Text style={[styles.cancelText, { color: mutedColor }]}>
						Annuler
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
	rocketEmoji: { fontSize: 56, marginBottom: 12 },
	title: {
		fontSize: 24,
		fontWeight: "800",
		textAlign: "center",
		marginBottom: 8,
	},
	subtitle: { fontSize: 14, textAlign: "center", lineHeight: 20 },
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
		borderBottomLeftRadius: 10,
		paddingHorizontal: 10,
		paddingVertical: 4,
	},
	popularText: { color: "#fff", fontSize: 11, fontWeight: "700" },
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
	planLabel: { fontSize: 15, fontWeight: "600" },
	planPrice: { fontSize: 18, fontWeight: "800" },
	payBtn: {
		flexDirection: "row",
		alignItems: "center",
		justifyContent: "center",
		gap: 8,
		borderRadius: 14,
		paddingVertical: 16,
		marginBottom: 12,
	},
	payBtnText: { color: "#fff", fontSize: 17, fontWeight: "800" },
	cancelBtn: { alignItems: "center", padding: 12 },
	cancelText: { fontSize: 14 },
});
