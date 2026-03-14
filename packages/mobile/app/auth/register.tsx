import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { useState } from "react";
import {
	ActivityIndicator,
	Alert,
	KeyboardAvoidingView,
	Platform,
	Pressable,
	ScrollView,
	StyleSheet,
	Text,
	TextInput,
	View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useColorScheme } from "@/hooks/use-color-scheme";
import { useAuth } from "@/src/lib/auth";

export default function RegisterScreen() {
	const isDark = useColorScheme() === "dark";
	const { register } = useAuth();
	const [name, setName] = useState("");
	const [email, setEmail] = useState("");
	const [password, setPassword] = useState("");
	const [confirm, setConfirm] = useState("");
	const [showPwd, setShowPwd] = useState(false);
	const [loading, setLoading] = useState(false);

	const bg = isDark ? "#0b1120" : "#f8fafc";
	const cardBg = isDark ? "#1e293b" : "#ffffff";
	const textColor = isDark ? "#e2e8f0" : "#0f172a";
	const mutedColor = isDark ? "#94a3b8" : "#64748b";
	const primaryColor = isDark ? "#3b82f6" : "#1e40af";
	const borderColor = isDark ? "#1e3a5f" : "#e2e8f0";

	const handleRegister = async () => {
		if (!name || !email || !password || !confirm) {
			Alert.alert("Erreur", "Veuillez remplir tous les champs");
			return;
		}
		if (password.length < 8) {
			Alert.alert(
				"Erreur",
				"Le mot de passe doit contenir au moins 8 caractères",
			);
			return;
		}
		if (password !== confirm) {
			Alert.alert("Erreur", "Les mots de passe ne correspondent pas");
			return;
		}
		setLoading(true);
		try {
			await register(name.trim(), email.trim().toLowerCase(), password);
			router.dismiss();
		} catch (err: any) {
			Alert.alert(
				"Inscription échouée",
				err.message ?? "Une erreur est survenue",
			);
		} finally {
			setLoading(false);
		}
	};

	const Field = ({
		label,
		value,
		onChange,
		placeholder,
		keyboard,
		secure,
		showToggle,
		toggleShow,
		autoComplete,
	}: any) => (
		<View style={{ gap: 6 }}>
			<Text style={[styles.fieldLabel, { color: mutedColor }]}>{label}</Text>
			<View style={[styles.inputWrapper, { borderColor }]}>
				<TextInput
					value={value}
					onChangeText={onChange}
					placeholder={placeholder}
					placeholderTextColor={mutedColor}
					style={[styles.input, { color: textColor }]}
					keyboardType={keyboard ?? "default"}
					secureTextEntry={secure}
					autoCapitalize={keyboard === "email-address" ? "none" : "words"}
					autoComplete={autoComplete}
				/>
				{showToggle && (
					<Pressable onPress={toggleShow} hitSlop={8}>
						<Ionicons
							name={!secure ? "eye-off-outline" : "eye-outline"}
							size={18}
							color={mutedColor}
						/>
					</Pressable>
				)}
			</View>
		</View>
	);

	return (
		<SafeAreaView style={[styles.safe, { backgroundColor: bg }]}>
			<KeyboardAvoidingView
				style={{ flex: 1 }}
				behavior={Platform.OS === "ios" ? "padding" : "height"}
			>
				<ScrollView
					contentContainerStyle={{ flexGrow: 1 }}
					keyboardShouldPersistTaps="handled"
				>
					<Pressable onPress={() => router.dismiss()} style={styles.closeBtn}>
						<Ionicons name="close" size={24} color={textColor} />
					</Pressable>

					<View style={styles.container}>
						<Text style={styles.logo}>✨</Text>
						<Text style={[styles.title, { color: textColor }]}>
							Créer un compte
						</Text>
						<Text style={[styles.subtitle, { color: mutedColor }]}>
							Rejoignez Buy'N'Sellem et commencez à acheter et vendre
						</Text>

						<View
							style={[styles.form, { backgroundColor: cardBg, borderColor }]}
						>
							<Field
								label="Nom complet"
								value={name}
								onChange={setName}
								placeholder="Jean Dupont"
								autoComplete="name"
							/>
							<Field
								label="Adresse email"
								value={email}
								onChange={setEmail}
								placeholder="votre@email.com"
								keyboard="email-address"
								autoComplete="email"
							/>
							<Field
								label="Mot de passe"
								value={password}
								onChange={setPassword}
								placeholder="Min. 8 caractères"
								secure={!showPwd}
								showToggle
								toggleShow={() => setShowPwd(!showPwd)}
								autoComplete="new-password"
							/>
							<Field
								label="Confirmer le mot de passe"
								value={confirm}
								onChange={setConfirm}
								placeholder="Répétez le mot de passe"
								secure={!showPwd}
								autoComplete="new-password"
							/>

							<Pressable
								onPress={handleRegister}
								disabled={loading}
								style={[
									styles.submitBtn,
									{ backgroundColor: primaryColor, opacity: loading ? 0.7 : 1 },
								]}
							>
								{loading ? (
									<ActivityIndicator color="#fff" />
								) : (
									<Text style={styles.submitText}>Créer mon compte</Text>
								)}
							</Pressable>

							<Text style={[styles.termsText, { color: mutedColor }]}>
								En créant un compte, vous acceptez nos{" "}
								<Text
									style={{ color: primaryColor }}
									onPress={() => router.push("/terms")}
								>
									Conditions d'utilisation
								</Text>{" "}
								et notre{" "}
								<Text
									style={{ color: primaryColor }}
									onPress={() => router.push("/privacy")}
								>
									Politique de confidentialité
								</Text>
								.
							</Text>
						</View>

						<View style={styles.loginRow}>
							<Text style={[styles.loginText, { color: mutedColor }]}>
								Déjà un compte ?{" "}
							</Text>
							<Pressable
								onPress={() => {
									router.dismiss();
									router.push("/auth/login");
								}}
							>
								<Text style={[styles.loginLink, { color: primaryColor }]}>
									Se connecter
								</Text>
							</Pressable>
						</View>
					</View>
				</ScrollView>
			</KeyboardAvoidingView>
		</SafeAreaView>
	);
}

const styles = StyleSheet.create({
	safe: { flex: 1 },
	closeBtn: { padding: 16, alignSelf: "flex-end" },
	container: { flex: 1, padding: 24, paddingTop: 8 },
	logo: { fontSize: 48, textAlign: "center", marginBottom: 12 },
	title: {
		fontSize: 26,
		fontWeight: "800",
		textAlign: "center",
		marginBottom: 8,
	},
	subtitle: {
		fontSize: 14,
		textAlign: "center",
		marginBottom: 28,
		lineHeight: 20,
	},
	form: { borderRadius: 16, borderWidth: 1, padding: 20, gap: 14 },
	fieldLabel: { fontSize: 13, fontWeight: "600" },
	inputWrapper: {
		flexDirection: "row",
		alignItems: "center",
		borderRadius: 10,
		borderWidth: 1.5,
		paddingHorizontal: 12,
		paddingVertical: 12,
	},
	input: { flex: 1, fontSize: 15 },
	submitBtn: {
		borderRadius: 12,
		paddingVertical: 15,
		alignItems: "center",
		marginTop: 4,
	},
	submitText: { color: "#fff", fontSize: 16, fontWeight: "700" },
	termsText: { fontSize: 12, textAlign: "center", lineHeight: 18 },
	loginRow: {
		flexDirection: "row",
		alignItems: "center",
		justifyContent: "center",
		marginTop: 20,
	},
	loginText: { fontSize: 14 },
	loginLink: { fontSize: 14, fontWeight: "700" },
});
