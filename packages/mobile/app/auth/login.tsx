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
import { AnimatedPressable } from "@/src/components/AnimatedPressable";
import { useAlert } from "@/src/contexts/AlertContext";
import { useAuth } from "@/src/lib/auth";

function AppLogo({ isDark }: { isDark: boolean }) {
	const baseColor = isDark ? "#e2e8f0" : "#0f172a";
	return (
		<View style={styles.logoBlock}>
			<Image
				source={require("@/assets/icon2.png")}
				style={styles.logoImg}
				contentFit="contain"
			/>
			<Text style={[styles.logoText, { color: baseColor }]}>
				Buy
				<Text style={{ color: "#f59e0b" }}>'</Text>
				<Text style={{ color: "#f59e0b" }}>N</Text>
				<Text style={{ color: "#f59e0b" }}>'</Text>Sellem
			</Text>
		</View>
	);
}

export default function LoginScreen() {
	const isDark = useColorScheme() === "dark";
	const { login } = useAuth();
	const { showError } = useAlert();
	const [email, setEmail] = useState("");
	const [password, setPassword] = useState("");
	const [showPwd, setShowPwd] = useState(false);
	const [loading, setLoading] = useState(false);

	const bg = isDark ? "#0b1120" : "#f8fafc";
	const cardBg = isDark ? "#1e293b" : "#ffffff";
	const textColor = isDark ? "#e2e8f0" : "#0f172a";
	const mutedColor = isDark ? "#94a3b8" : "#64748b";
	const primaryColor = isDark ? "#3b82f6" : "#1e40af";
	const borderColor = isDark ? "#1e3a5f" : "#e2e8f0";

	const handleLogin = async () => {
		if (!email || !password) {
			showError("Champs manquants", "Veuillez remplir tous les champs");
			return;
		}
		setLoading(true);
		try {
			await login(email.trim().toLowerCase(), password);
			router.dismiss();
		} catch (err: any) {
			showError(
				"Connexion échouée",
				err.message ?? "Email ou mot de passe incorrect",
			);
		} finally {
			setLoading(false);
		}
	};

	return (
		<SafeAreaView
			edges={["top"]}
			style={[styles.safe, { backgroundColor: bg }]}
		>
			<KeyboardAwareScrollView
				style={{ flex: 1 }}
				contentContainerStyle={{ flexGrow: 1 }}
				keyboardShouldPersistTaps="handled"
				bottomOffset={20}
			>
				{/* Close button */}
				<Pressable onPress={() => router.dismiss()} style={styles.closeBtn}>
					<Ionicons name="close" size={24} color={textColor} />
				</Pressable>

				<View style={styles.container}>
					{/* Logo */}
					<View style={styles.logoWrap}>
						<AppLogo isDark={isDark} />
					</View>
					<Text style={[styles.title, { color: textColor }]}>Bon retour !</Text>
					<Text style={[styles.subtitle, { color: mutedColor }]}>
						Connectez-vous à votre compte
					</Text>

					{/* Form */}
					<View style={[styles.form, { backgroundColor: cardBg, borderColor }]}>
						{/* Email */}
						<View style={styles.fieldGroup}>
							<Text style={[styles.fieldLabel, { color: mutedColor }]}>
								Adresse email
							</Text>
							<View style={[styles.inputWrapper, { borderColor }]}>
								<Ionicons
									name="mail-outline"
									size={18}
									color={mutedColor}
									style={styles.inputIcon}
								/>
								<TextInput
									value={email}
									onChangeText={setEmail}
									placeholder="votre@email.com"
									placeholderTextColor={mutedColor}
									style={[styles.input, { color: textColor }]}
									keyboardType="email-address"
									autoCapitalize="none"
									autoComplete="email"
								/>
							</View>
						</View>

						{/* Password */}
						<View style={styles.fieldGroup}>
							<View style={styles.labelRow}>
								<Text style={[styles.fieldLabel, { color: mutedColor }]}>
									Mot de passe
								</Text>
								<Pressable onPress={() => router.push("/auth/forgot-password")}>
									<Text style={[styles.forgotLink, { color: primaryColor }]}>
										Mot de passe oublié ?
									</Text>
								</Pressable>
							</View>
							<View style={[styles.inputWrapper, { borderColor }]}>
								<Ionicons
									name="lock-closed-outline"
									size={18}
									color={mutedColor}
									style={styles.inputIcon}
								/>
								<TextInput
									value={password}
									onChangeText={setPassword}
									placeholder="••••••••"
									placeholderTextColor={mutedColor}
									style={[styles.input, { color: textColor }]}
									secureTextEntry={!showPwd}
									autoComplete="password"
								/>
								<Pressable onPress={() => setShowPwd(!showPwd)} hitSlop={8}>
									<Ionicons
										name={showPwd ? "eye-off-outline" : "eye-outline"}
										size={18}
										color={mutedColor}
									/>
								</Pressable>
							</View>
						</View>

						{/* Submit */}
						<AnimatedPressable
							onPress={handleLogin}
							disabled={loading}
							scaleTo={0.97}
							style={[
								styles.submitBtn,
								{ backgroundColor: primaryColor, opacity: loading ? 0.7 : 1 },
							]}
						>
							{loading ? (
								<ActivityIndicator color="#fff" />
							) : (
								<Text style={styles.submitText}>Se connecter</Text>
							)}
						</AnimatedPressable>
					</View>

					{/* Register Link */}
					<View style={styles.registerRow}>
						<Text style={[styles.registerText, { color: mutedColor }]}>
							Pas encore de compte ?{" "}
						</Text>
						<Pressable
							onPress={() => {
								router.dismiss();
								router.push("/auth/register");
							}}
						>
							<Text style={[styles.registerLink, { color: primaryColor }]}>
								Créer un compte
							</Text>
						</Pressable>
					</View>
				</View>
			</KeyboardAwareScrollView>
		</SafeAreaView>
	);
}

const styles = StyleSheet.create({
	safe: { flex: 1 },
	closeBtn: { padding: 16, alignSelf: "flex-end" },
	container: { flex: 1, padding: 24, paddingTop: 8 },
	logoWrap: { alignItems: "center", marginBottom: 20 },
	logoBlock: { alignItems: "center", gap: 10 },
	logoImg: { width: 72, height: 72, borderRadius: 18 },
	logoText: {
		fontSize: 32,
		fontFamily: Fonts.displayExtrabold,
		letterSpacing: -0.5,
	},
	title: {
		fontSize: 26,
		fontFamily: Fonts.displayExtrabold,
		textAlign: "center",
		marginBottom: 8,
	},
	subtitle: {
		fontSize: 15,
		fontFamily: Fonts.body,
		textAlign: "center",
		marginBottom: 28,
		lineHeight: 22,
	},
	form: { borderRadius: 16, borderWidth: 1, padding: 20, gap: 16 },
	fieldGroup: { gap: 6 },
	fieldLabel: { fontSize: 13, fontFamily: Fonts.bodySemibold },
	labelRow: {
		flexDirection: "row",
		justifyContent: "space-between",
		alignItems: "center",
	},
	forgotLink: { fontSize: 13, fontFamily: Fonts.bodySemibold },
	inputWrapper: {
		flexDirection: "row",
		alignItems: "center",
		borderRadius: 10,
		borderWidth: 1.5,
		paddingHorizontal: 12,
		paddingVertical: 12,
	},
	inputIcon: { marginRight: 10 },
	input: { flex: 1, fontSize: 15, fontFamily: Fonts.body },
	submitBtn: {
		borderRadius: 12,
		paddingVertical: 15,
		alignItems: "center",
		marginTop: 4,
	},
	submitText: { color: "#fff", fontSize: 16, fontFamily: Fonts.displayBold },
	registerRow: {
		flexDirection: "row",
		alignItems: "center",
		justifyContent: "center",
		marginTop: 24,
	},
	registerText: { fontSize: 14, fontFamily: Fonts.body },
	registerLink: { fontSize: 14, fontFamily: Fonts.bodySemibold },
});
