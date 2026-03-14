import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { useState } from "react";
import {
	ActivityIndicator,
	Alert,
	Pressable,
	StyleSheet,
	Text,
	TextInput,
	View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useColorScheme } from "@/hooks/use-color-scheme";
import { api } from "@/src/lib/api";

export default function ForgotPasswordScreen() {
	const isDark = useColorScheme() === "dark";
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
			Alert.alert("Erreur", err.message ?? "Une erreur est survenue");
		} finally {
			setLoading(false);
		}
	};

	if (sent) {
		return (
			<SafeAreaView style={[styles.safe, { backgroundColor: bg }]}>
				<View style={styles.center}>
					<Text style={styles.successEmoji}>📧</Text>
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
		<SafeAreaView style={[styles.safe, { backgroundColor: bg }]}>
			<Pressable onPress={() => router.back()} style={styles.backBtn}>
				<Ionicons name="arrow-back" size={22} color={textColor} />
			</Pressable>
			<View style={styles.container}>
				<Text style={styles.emoji}>🔑</Text>
				<Text style={[styles.title, { color: textColor }]}>
					Mot de passe oublié
				</Text>
				<Text style={[styles.subtitle, { color: mutedColor }]}>
					Entrez votre adresse email et nous vous enverrons un lien de
					réinitialisation.
				</Text>
				<Text style={[styles.label, { color: mutedColor }]}>Adresse email</Text>
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
		</SafeAreaView>
	);
}

const styles = StyleSheet.create({
	safe: { flex: 1 },
	backBtn: { padding: 16 },
	container: { padding: 24 },
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
