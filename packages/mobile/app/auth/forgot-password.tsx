import { Ionicons } from "@expo/vector-icons";
import { Image } from "expo-image";
import { router } from "expo-router";
import { useState } from "react";
import {
	ActivityIndicator,
	Pressable,
	StyleSheet,
	Text,
	TextInput,
	View,
} from "react-native";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";
import { SafeAreaView } from "react-native-safe-area-context";
import { Fonts } from "@/constants/theme";
import { useColorScheme } from "@/hooks/use-color-scheme";
import { useAlert } from "@/src/contexts/AlertContext";
import { api } from "@/src/lib/api";

export default function ForgotPasswordScreen() {
	const isDark = useColorScheme() === "dark";
	const { showError } = useAlert();
	const [email, setEmail] = useState("");
	const [loading, setLoading] = useState(false);
	const [sent, setSent] = useState(false);

	const bg = isDark ? "#0b1120" : "#f8fafc";
	const cardBg = isDark ? "#1e293b" : "#ffffff";
	const textColor = isDark ? "#e2e8f0" : "#0f172a";
	const mutedColor = isDark ? "#94a3b8" : "#64748b";
	const primaryColor = isDark ? "#3b82f6" : "#1e40af";
	const borderColor = isDark ? "#1e3a5f" : "#e2e8f0";

	const handleSubmit = async () => {
		if (!email) return;
		setLoading(true);
		try {
			await api.post("/api/users/forgot-password", {
				email: email.trim().toLowerCase(),
			});
			setSent(true);
		} catch (err: any) {
			showError("Erreur", err.message ?? "Une erreur est survenue");
		} finally {
			setLoading(false);
		}
	};

	if (sent) {
		return (
			<SafeAreaView
				edges={["top"]}
				style={[styles.safe, { backgroundColor: bg }]}
			>
				<View style={styles.center}>
					<Ionicons
						name="mail-outline"
						size={64}
						color="#1e40af"
						style={{ marginBottom: 16 }}
					/>
					<Text style={[styles.title, { color: textColor }]}>
						Email envoyé !
					</Text>
					<Text style={[styles.subtitle, { color: mutedColor }]}>
						Vérifiez votre boîte email et suivez les instructions pour
						réinitialiser votre mot de passe.
					</Text>
					<Pressable
						onPress={() => router.dismiss()}
						style={[styles.btn, { backgroundColor: primaryColor }]}
					>
						<Text style={styles.btnText}>Retour à la connexion</Text>
					</Pressable>
				</View>
			</SafeAreaView>
		);
	}

	return (
		<SafeAreaView
			edges={["top"]}
			style={[styles.safe, { backgroundColor: bg }]}
		>
			<Pressable onPress={() => router.back()} style={styles.backBtn}>
				<Ionicons name="arrow-back" size={22} color={textColor} />
			</Pressable>
			<KeyboardAwareScrollView
				style={{ flex: 1 }}
				contentContainerStyle={{ flexGrow: 1 }}
				keyboardShouldPersistTaps="handled"
				bottomOffset={20}
			>
				<View style={styles.container}>
					<View style={styles.logoBlock}>
						<Image
							source={require("@/assets/icon2.png")}
							style={styles.logoImg}
							contentFit="contain"
						/>
						<Text style={[styles.logoText, { color: textColor }]}>
							Buy
							<Text style={{ color: "#f59e0b" }}>'</Text>
							<Text style={{ color: "#f59e0b" }}>N</Text>
							<Text style={{ color: "#f59e0b" }}>'</Text>Sellem
						</Text>
					</View>
					<Text style={[styles.title, { color: textColor }]}>
						Mot de passe oublié
					</Text>
					<Text style={[styles.subtitle, { color: mutedColor }]}>
						Entrez votre adresse email et nous vous enverrons un lien de
						réinitialisation.
					</Text>
					<Text style={[styles.label, { color: mutedColor }]}>
						Adresse email
					</Text>
					<View
						style={[
							styles.inputWrapper,
							{ backgroundColor: cardBg, borderColor },
						]}
					>
						<Ionicons
							name="mail-outline"
							size={18}
							color={mutedColor}
							style={{ marginRight: 10 }}
						/>
						<TextInput
							value={email}
							onChangeText={setEmail}
							placeholder="votre@email.com"
							placeholderTextColor={mutedColor}
							style={[styles.input, { color: textColor }]}
							keyboardType="email-address"
							autoCapitalize="none"
						/>
					</View>
					<Pressable
						onPress={handleSubmit}
						disabled={loading || !email}
						style={[
							styles.btn,
							{ backgroundColor: primaryColor, opacity: !email ? 0.5 : 1 },
						]}
					>
						{loading ? (
							<ActivityIndicator color="#fff" />
						) : (
							<Text style={styles.btnText}>Envoyer le lien</Text>
						)}
					</Pressable>
				</View>
			</KeyboardAwareScrollView>
		</SafeAreaView>
	);
}

const styles = StyleSheet.create({
	safe: { flex: 1 },
	backBtn: { padding: 16 },
	container: { padding: 24 },
	logoBlock: { alignItems: "center", gap: 10, marginBottom: 24 },
	logoImg: { width: 72, height: 72, borderRadius: 18 },
	logoText: {
		fontSize: 28,
		fontFamily: Fonts.displayExtrabold,
		letterSpacing: -0.5,
	},
	center: {
		flex: 1,
		alignItems: "center",
		justifyContent: "center",
		padding: 32,
	},
	emoji: { fontSize: 48, marginBottom: 16, textAlign: "center" },
	successEmoji: { fontSize: 64, marginBottom: 16 },
	title: {
		fontSize: 24,
		fontWeight: "800",
		textAlign: "center",
		marginBottom: 12,
	},
	subtitle: {
		fontSize: 14,
		textAlign: "center",
		lineHeight: 22,
		marginBottom: 28,
	},
	label: { fontSize: 13, fontWeight: "600", marginBottom: 8 },
	inputWrapper: {
		flexDirection: "row",
		alignItems: "center",
		borderRadius: 12,
		borderWidth: 1.5,
		paddingHorizontal: 12,
		paddingVertical: 13,
		marginBottom: 16,
	},
	input: { flex: 1, fontSize: 15 },
	btn: { borderRadius: 14, paddingVertical: 15, alignItems: "center" },
	btnText: { color: "#fff", fontSize: 16, fontWeight: "700" },
});
